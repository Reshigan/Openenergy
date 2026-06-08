import React, { useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';


// Lazy-loaded tab modules — each loads only when the tab is first activated.
const BondRegistryTab = React.lazy(() => import('../ipp/BondRegistryTab').then(m => ({ default: m.BondRegistryTab })));
const PlannedOutageChainTab = React.lazy(() => import('../grid/PlannedOutageChainTab').then(m => ({ default: m.PlannedOutageChainTab })));
const ProcurementChainTab = React.lazy(() => import('../ipp/ProcurementChainTab').then(m => ({ default: m.ProcurementChainTab })));
const CodChainTab = React.lazy(() => import('../ipp/CodChainTab').then(m => ({ default: m.CodChainTab })));
const DfrChainTab = React.lazy(() => import('../ipp/DfrChainTab').then(m => ({ default: m.DfrChainTab })));
const PunchListChainTab = React.lazy(() => import('../ipp/PunchListChainTab').then(m => ({ default: m.PunchListChainTab })));
const ItpChainTab = React.lazy(() => import('../ipp/ItpChainTab').then(m => ({ default: m.ItpChainTab })));
const HandoverDossierChainTab = React.lazy(() => import('../ipp/HandoverDossierChainTab').then(m => ({ default: m.HandoverDossierChainTab })));
const ProjectRiskChainTab = React.lazy(() => import('../ipp/ProjectRiskChainTab').then(m => ({ default: m.ProjectRiskChainTab })));
const InsuranceClaimChainTab = React.lazy(() => import('../ipp/InsuranceClaimChainTab').then(m => ({ default: m.InsuranceClaimChainTab })));
const HseIncidentChainTab = React.lazy(() => import('../hse/HseIncidentChainTab').then(m => ({ default: m.HseIncidentChainTab })));
const CyberIncidentChainTab = React.lazy(() => import('../cyber/CyberIncidentChainTab').then(m => ({ default: m.CyberIncidentChainTab })));
const EdCommitmentChainTab = React.lazy(() => import('../ed/EdCommitmentChainTab').then(m => ({ default: m.EdCommitmentChainTab })));
const GcaChainTab = React.lazy(() => import('../gca/GcaChainTab').then(m => ({ default: m.GcaChainTab })));
const IppScheduleChainTab = React.lazy(() => import('../ipp/IppScheduleChainTab').then(m => ({ default: m.IppScheduleChainTab })));
const IppEvmChainTab = React.lazy(() => import('../ipp/IppEvmChainTab').then(m => ({ default: m.IppEvmChainTab })));
const IppDocumentControlChainTab = React.lazy(() => import('../ipp/IppDocumentControlChainTab').then(m => ({ default: m.IppDocumentControlChainTab })));
const IppSubmittalChainTab = React.lazy(() => import('../ipp/IppSubmittalChainTab').then(m => ({ default: m.IppSubmittalChainTab })));
const IppRfiChainTab = React.lazy(() => import('../ipp/IppRfiChainTab').then(m => ({ default: m.IppRfiChainTab })));
const IppChangeOrderChainTab = React.lazy(() => import('../ipp/IppChangeOrderChainTab').then(m => ({ default: m.IppChangeOrderChainTab })));
const TakeOrPayChainTab = React.lazy(() => import('../take-or-pay/TakeOrPayChainTab').then(m => ({ default: m.TakeOrPayChainTab })));
const ScadaConnectorTab = React.lazy(() => import('../scadaConnector/ScadaConnectorTab').then(m => ({ default: m.ScadaConnectorTab })));
const MqttOpcuaConnectorTab = React.lazy(() => import('../mqttOpcuaConnector/MqttOpcuaConnectorTab').then(m => ({ default: m.MqttOpcuaConnectorTab })));
const AnomalyDetectionMlTab = React.lazy(() => import('../anomalyDetectionMl/AnomalyDetectionMlTab').then(m => ({ default: m.AnomalyDetectionMlTab })));
const RulPredictionMlTab = React.lazy(() => import('../rulPredictionMl/RulPredictionMlTab'));
const FaultFingerprintMlTab = React.lazy(() => import('../faultFingerprintMl/FaultFingerprintMlTab').then(m => ({ default: m.FaultFingerprintMlTab })));
const StageGateTab = React.lazy(() => import('../stageGate/StageGateTab'));
const IppIssuesTab = React.lazy(() => import('../ippIssues/IppIssuesTab'));
const IppRiskTab = React.lazy(() => import('../ippRisk/IppRiskTab'));
const IppStakeholderTab = React.lazy(() => import('../ippStakeholder/IppStakeholderTab'));
const IppLessonsLearnedTab = React.lazy(() => import('../ippLessonsLearned/IppLessonsLearnedTab'));
const IppNcrTab = React.lazy(() => import('../ippNcr/IppNcrTab'));
const IppMethodStatementTab = React.lazy(() => import('../ippMethodStatement/IppMethodStatementTab'));
const IppEnvMonitoringTab = React.lazy(() => import('../ippEnvMonitoring/IppEnvMonitoringTab'));
const IppMirTab = React.lazy(() => import('../ippMir/IppMirTab'));
const IppSubcontractorTab = React.lazy(() => import('../ippSubcontractor/IppSubcontractorTab'));
const IppProgressClaimTab = React.lazy(() => import('../ippProgressClaim/IppProgressClaimTab'));
const IppTqTab = React.lazy(() => import('../ippTq/IppTqTab'));
const IppDiaryTab = React.lazy(() => import('../ipp/IppDiaryTab').then(m => ({ default: m.IppDiaryTab })));
const IppSiteInstructionTab = React.lazy(() => import('../ipp/IppSiteInstructionTab').then(m => ({ default: m.IppSiteInstructionTab })));
const IppDlpDefectTab = React.lazy(() => import('../ipp/IppDlpDefectTab').then(m => ({ default: m.IppDlpDefectTab })));
const IppVariationOrderTab = React.lazy(() => import('../ipp/IppVariationOrderTab').then(m => ({ default: m.IppVariationOrderTab })));
const IppPaymentCertTab = React.lazy(() => import('../ipp/IppPaymentCertTab').then(m => ({ default: m.IppPaymentCertTab })));
const IppFinalCompletionTab = React.lazy(() => import('../ipp/IppFinalCompletionTab').then(m => ({ default: m.IppFinalCompletionTab })));
const IppOmHandoverTab = React.lazy(() => import('../ipp/IppOmHandoverTab').then(m => ({ default: m.IppOmHandoverTab })));
const IppLandRegisterTab = React.lazy(() => import('../ipp/IppLandRegisterTab').then(m => ({ default: m.IppLandRegisterTab })));
const IppEnvClosureTab = React.lazy(() => import('../ipp/IppEnvClosureTab').then(m => ({ default: m.IppEnvClosureTab })));
const IppCommissioningTestTab = React.lazy(() => import('../ipp/IppCommissioningTestTab').then(m => ({ default: m.IppCommissioningTestTab })));
const IppIeCertTab = React.lazy(() => import('../ipp/IppIeCertTab').then(m => ({ default: m.IppIeCertTab })));
const IppTpaTab = React.lazy(() => import('../ipp/IppTpaTab').then(m => ({ default: m.IppTpaTab })));
const IppPpaVariationTab = React.lazy(() => import('../ipp/IppPpaVariationTab').then(m => ({ default: m.IppPpaVariationTab })));
const IppChangeOfControlTab = React.lazy(() => import('../ipp/IppChangeOfControlTab').then(m => ({ default: m.IppChangeOfControlTab })));
const IppRefinancingTab = React.lazy(() => import('../ipp/IppRefinancingTab').then(m => ({ default: m.IppRefinancingTab })));
const IppFmTab = React.lazy(() => import('../ipp/IppFmTab').then(m => ({ default: m.IppFmTab })));
const IppAnnualReportTab = React.lazy(() => import('../ipp/IppAnnualReportTab').then(m => ({ default: m.IppAnnualReportTab })));
const IppContractorDefaultTab = React.lazy(() => import('../ipp/IppContractorDefaultTab').then(m => ({ default: m.IppContractorDefaultTab })));
const IppEcoReportTab = React.lazy(() => import('../ipp/IppEcoReportTab').then(m => ({ default: m.IppEcoReportTab })));
const IppLtaCertificateTab = React.lazy(() => import('../ipp/IppLtaCertificateTab').then(m => ({ default: m.IppLtaCertificateTab })));
const IppLandAmendmentTab = React.lazy(() => import('../ipp/IppLandAmendmentTab').then(m => ({ default: m.IppLandAmendmentTab })));
const IppCommunityTrustTab = React.lazy(() => import('../ipp/IppCommunityTrustTab').then(m => ({ default: m.IppCommunityTrustTab })));
const IppGridComplianceTab = React.lazy(() => import('../ipp/IppGridComplianceTab').then(m => ({ default: m.IppGridComplianceTab })));
const IppCccTab = React.lazy(() => import('../ipp/IppCccTab').then(m => ({ default: m.IppCccTab })));
const IppOmContractTab = React.lazy(() => import('../ipp/IppOmContractTab').then(m => ({ default: m.IppOmContractTab })));
const IppBfsTab = React.lazy(() => import('../ipp/IppBfsTab').then(m => ({ default: m.IppBfsTab })));
const IppEaAmendmentTab = React.lazy(() => import('../ipp/IppEaAmendmentTab').then(m => ({ default: m.IppEaAmendmentTab })));
const IppWulTab = React.lazy(() => import('../ipp/IppWulTab').then(m => ({ default: m.IppWulTab })));
const IppHraTab = React.lazy(() => import('../ipp/IppHraTab').then(m => ({ default: m.IppHraTab })));
const IppAelTab = React.lazy(() => import('../ipp/IppAelTab').then(m => ({ default: m.IppAelTab })));
const IppForceMajeureTab = React.lazy(() => import('../ipp/IppForceMajeureTab').then(m => ({ default: m.IppForceMajeureTab })));
const IppLcReportTab = React.lazy(() => import('../ipp/IppLcReportTab').then(m => ({ default: m.IppLcReportTab })));
const IppMilestoneCertTab = React.lazy(() => import('../ipp/IppMilestoneCertTab').then(m => ({ default: m.IppMilestoneCertTab })));
const IppEsmrTab = React.lazy(() => import('../ipp/IppEsmrTab').then(m => ({ default: m.IppEsmrTab })));
const IppIearTab = React.lazy(() => import('../ipp/IppIearTab').then(m => ({ default: m.IppIearTab })));
const IppInsrTab = React.lazy(() => import('../ipp/IppInsrTab').then(m => ({ default: m.IppInsrTab })));
const IppPerfSecurityTab = React.lazy(() => import('../ipp/IppPerfSecurityTab').then(m => ({ default: m.IppPerfSecurityTab })));
const IppCepComplianceTab = React.lazy(() => import('../ipp/IppCepComplianceTab').then(m => ({ default: m.IppCepComplianceTab })));
const IppSedComplianceTab = React.lazy(() => import('../ipp/IppSedComplianceTab').then(m => ({ default: m.IppSedComplianceTab })));
const IppBbbeeVerificationTab = React.lazy(() => import('../ipp/IppBbbeeVerificationTab').then(m => ({ default: m.IppBbbeeVerificationTab })));
const IppLenderReportingTab = React.lazy(() => import('../ipp/IppLenderReportingTab').then(m => ({ default: m.IppLenderReportingTab })));
const IppLicenceReturnsTab = React.lazy(() => import('../ipp/IppLicenceReturnsTab').then(m => ({ default: m.IppLicenceReturnsTab })));
const IppReippppReportsTab = React.lazy(() => import('../ipp/IppReippppReportsTab').then(m => ({ default: m.IppReippppReportsTab })));
const IppEquityTransferTab = React.lazy(() => import('../ipp/IppEquityTransferTab').then(m => ({ default: m.IppEquityTransferTab })));
const IppQuarterlyGenReportTab = React.lazy(() => import('../ipp/IppQuarterlyGenReportTab').then(m => ({ default: m.IppQuarterlyGenReportTab })));
const IppAnnualComplianceAssessmentTab = React.lazy(() => import('../ipp/IppAnnualComplianceAssessmentTab').then(m => ({ default: m.IppAnnualComplianceAssessmentTab })));
const IppAnnualAuditTab = React.lazy(() => import('../ipp/IppAnnualAuditTab').then(m => ({ default: m.IppAnnualAuditTab })));
const IppEmpComplianceReportTab = React.lazy(() => import('../ipp/IppEmpComplianceReportTab').then(m => ({ default: m.IppEmpComplianceReportTab })));
const IppCpTrackerTab = React.lazy(() => import('../ipp/IppCpTrackerTab').then(m => ({ default: m.IppCpTrackerTab })));
const IppLicenceObligationTab = React.lazy(() => import('../ipp/IppLicenceObligationTab').then(m => ({ default: m.IppLicenceObligationTab })));

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
        { key: 'wbs_schedule', label: 'WBS & Gantt', group: 'Project controls', chainKey: 'ipp_schedule', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppScheduleChainTab /></React.Suspense> },
        { key: 'cost-evm', label: 'Cost & EVM', group: 'Project controls', chainKey: 'ipp_evm', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEvmChainTab /></React.Suspense> },
        { key: 'document-control', label: 'Document control', group: 'Documents', chainKey: 'ipp_doc_control', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppDocumentControlChainTab /></React.Suspense> },
        { key: 'submittals', label: 'Submittals', group: 'Documents', chainKey: 'ipp_submittal', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppSubmittalChainTab /></React.Suspense> },
        { key: 'rfis', label: 'RFIs', group: 'Documents', chainKey: 'ipp_rfi', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppRfiChainTab /></React.Suspense> },
        { key: 'change-orders', label: 'Change orders', group: 'Documents', chainKey: 'project_change_order', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppChangeOrderChainTab /></React.Suspense> },
        { key: 'technical-queries', label: 'Technical queries', group: 'Documents', chainKey: 'ipp_tq', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppTqTab /></React.Suspense> },
        { key: 'site-instructions', label: 'Site instructions (W144)', group: 'Documents', chainKey: 'site_instruction', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppSiteInstructionTab /></React.Suspense> },
        { key: 'dlp-defects', label: 'DLP defects (W145)', group: 'Documents', chainKey: 'dlp_defect', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppDlpDefectTab /></React.Suspense> },
        { key: 'variation-orders', label: 'Variation orders (W146)', group: 'Documents', chainKey: 'variation_order', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppVariationOrderTab /></React.Suspense> },
        { key: 'payment-certs', label: 'Payment certs (W147)', group: 'Documents', chainKey: 'ipp_payment_cert', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppPaymentCertTab /></React.Suspense> },
        { key: 'final-completion', label: 'Final completion (W148)', group: 'Documents', chainKey: 'ipp_final_completion', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppFinalCompletionTab /></React.Suspense> },
        { key: 'om-handover', label: 'O&M handover (W149)', group: 'Documents', chainKey: 'ipp_om_handover', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppOmHandoverTab /></React.Suspense> },
        { key: 'land-register', label: 'Land register (W150)', group: 'Documents', chainKey: 'ipp_land_register', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLandRegisterTab /></React.Suspense> },
        { key: 'env-closure', label: 'Env closure (W151)', group: 'Documents', chainKey: 'ipp_env_closure', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEnvClosureTab /></React.Suspense> },
        { key: 'commissioning-test', label: 'Commissioning test (W152)', group: 'Documents', chainKey: 'ipp_mc', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppCommissioningTestTab /></React.Suspense> },
        { key: 'ie-cert', label: 'IE certifications (W153)', group: 'Documents', chainKey: 'ipp_ie_cert', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppIeCertTab /></React.Suspense> },
        { key: 'tpa-wheeling', label: 'TPA wheeling (W154)', group: 'Documents', chainKey: 'ipp_tpa', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppTpaTab /></React.Suspense> },
        { key: 'ppa-variation', label: 'PPA variations (W155)', group: 'Documents', chainKey: 'ipp_ppavar', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppPpaVariationTab /></React.Suspense> },
        { key: 'change-of-control', label: 'Change of control (W156)', group: 'Documents', chainKey: 'ipp_coc', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppChangeOfControlTab /></React.Suspense> },
        { key: 'refinancing', label: 'Refinancing (W157)', group: 'Documents', chainKey: 'ipp_refi', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppRefinancingTab /></React.Suspense> },
        { key: 'force-majeure', label: 'Force majeure (W158)', group: 'Documents', chainKey: 'ipp_fm', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppFmTab /></React.Suspense> },
        { key: 'annual-report', label: 'Annual compliance report (W159)', group: 'Documents', chainKey: 'ipp_acr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppAnnualReportTab /></React.Suspense> },
        { key: 'contractor-default', label: 'Contractor default (W160)', group: 'Documents', chainKey: 'ipp_cd', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppContractorDefaultTab /></React.Suspense> },
        { key: 'eco-report', label: 'ECO audit report (W161)', group: 'Documents', chainKey: 'ipp_eco', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEcoReportTab /></React.Suspense> },
        { key: 'lta-certificate', label: 'LTA drawdown cert (W162)', group: 'Documents', chainKey: 'ipp_lta', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLtaCertificateTab /></React.Suspense> },
        { key: 'land-amendment', label: 'Land & servitude amendment (W163)', group: 'Documents', chainKey: 'ipp_lam', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLandAmendmentTab /></React.Suspense> },
        { key: 'community-trust', label: 'Community trust disbursement (W164)', group: 'Documents', chainKey: 'ipp_ctr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppCommunityTrustTab /></React.Suspense> },
        { key: 'grid-compliance', label: 'Grid code compliance (W165)', group: 'Technical', chainKey: 'ipp_gcc', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppGridComplianceTab /></React.Suspense> },
        { key: 'ccc', label: 'Connection cost contribution (W166)', group: 'Technical', chainKey: 'ipp_ccc', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppCccTab /></React.Suspense> },
        { key: 'om-contract', label: 'O&M contract renewal (W167)', group: 'Technical', chainKey: 'ipp_omc', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppOmContractTab /></React.Suspense> },
        { key: 'bfs', label: 'BFS re-certification (W168)', group: 'Technical', chainKey: 'ipp_bfs', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppBfsTab /></React.Suspense> },
        { key: 'ea-amendment', label: 'EA amendment & compliance (W169)', group: 'Environmental', chainKey: 'ipp_eam', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEaAmendmentTab /></React.Suspense> },
        { key: 'wul', label: 'Water use licence (W170)', group: 'Environmental', chainKey: 'ipp_wul', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppWulTab /></React.Suspense> },
        { key: 'hra', label: 'Heritage resources assessment (W171)', group: 'Environmental', chainKey: 'ipp_hra', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppHraTab /></React.Suspense> },
        { key: 'ael', label: 'Atmospheric emission licence (W172)', group: 'Environmental', chainKey: 'ipp_ael', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppAelTab /></React.Suspense> },
        { key: 'lc-report', label: 'Local content & SED compliance (W174)', group: 'Risk', chainKey: 'ipp_lcr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLcReportTab /></React.Suspense> },
        { key: 'milestone-cert', label: 'Milestone certification (W175)', group: 'Risk', chainKey: 'ipp_mc', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppMilestoneCertTab /></React.Suspense> },
        { key: 'esmr', label: 'DFI E&S monitoring report (W176)', group: 'Risk', chainKey: 'ipp_esmr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEsmrTab /></React.Suspense> },
        { key: 'iear', label: 'IE annual performance review (W177)', group: 'Risk', chainKey: 'ipp_iear', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppIearTab /></React.Suspense> },
        { key: 'insr', label: 'Insurance renewal (W178)', group: 'Risk', chainKey: 'ipp_insr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppInsrTab /></React.Suspense> },
        { key: 'perf-security', label: 'Performance security (W179)', group: 'Risk', chainKey: 'ipp_psec', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppPerfSecurityTab /></React.Suspense> },
        { key: 'cep-compliance', label: 'Community equity participation (W180)', group: 'Risk', chainKey: 'ipp_cep', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppCepComplianceTab /></React.Suspense> },
        { key: 'sed-compliance', label: 'SED annual spend compliance (W181)', group: 'Risk', chainKey: 'ipp_sed', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppSedComplianceTab /></React.Suspense> },
        { key: 'bbbee-verification', label: 'BBBEE annual verification (W182)', group: 'Risk', chainKey: 'ipp_bbbee', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppBbbeeVerificationTab /></React.Suspense> },
        { key: 'lender-reporting', label: 'Lender reporting covenant (W183)', group: 'Risk', chainKey: 'ipp_lrep', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLenderReportingTab /></React.Suspense> },
        { key: 'licence-returns', label: 'Annual NERSA licence return (W184)', group: 'Risk', chainKey: 'ipp_anr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLicenceReturnsTab /></React.Suspense> },
        { key: 'licence-obligations', label: 'Licence Obligations (W193)', group: 'Regulatory', chainKey: 'licence_obligation', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLicenceObligationTab /></React.Suspense> },
        { key: 'force_majeure', label: 'Force Majeure (W194)', group: 'Operations', chainKey: 'ipp_fm', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppForceMajeureTab /></React.Suspense> },
        { key: 'export_curtailments', label: 'Grid export curtailments (W221)', group: 'Operations', chainKey: 'export_curtailment', body: ({ onRefresh }) => <ExportCurtailmentTab onRefresh={onRefresh} /> },
        { key: 'reipppp-reports', label: 'REIPPPP annual progress report (W185)', group: 'Risk', chainKey: 'ipp_rpr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppReippppReportsTab /></React.Suspense> },
        { key: 'equity-transfer', label: 'SPV equity transfer & consent (W186)', group: 'Risk', chainKey: 'ipp_eqt', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEquityTransferTab /></React.Suspense> },
        { key: 'quarterly-gen-report', label: 'DMRE quarterly generation report (W187)', group: 'Risk', chainKey: 'ipp_qgr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppQuarterlyGenReportTab /></React.Suspense> },
        { key: 'annual-compliance-assessment', label: 'Annual grid code compliance self-assessment (W188)', group: 'Risk', chainKey: 'ipp_acs', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppAnnualComplianceAssessmentTab /></React.Suspense> },
        { key: 'annual-audit', label: 'Annual financial statements & audit (W189)', group: 'Risk', chainKey: 'ipp_aud', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppAnnualAuditTab /></React.Suspense> },
        { key: 'emp-compliance-report', label: 'EMP annual compliance report (W190)', group: 'Risk', chainKey: 'ipp_empr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEmpComplianceReportTab /></React.Suspense> },
        { key: 'stage-gates', label: 'Stage gates', group: 'Risk & quality', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><StageGateTab /></React.Suspense> },
        { key: 'issues-log', label: 'Issues log', group: 'Risk & quality', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppIssuesTab /></React.Suspense> },
        { key: 'risk-register', label: 'Risk register', group: 'Risk & quality', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppRiskTab /></React.Suspense> },
        { key: 'stakeholder-register', label: 'Stakeholder register', group: 'Risk & quality', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppStakeholderTab /></React.Suspense> },
        { key: 'lessons-learned', label: 'Lessons learned', group: 'Risk & quality', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppLessonsLearnedTab /></React.Suspense> },
        { key: 'ncr', label: 'Non-conformance (NCR)', group: 'Risk & quality', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppNcrTab /></React.Suspense> },
        { key: 'itp', label: 'ITP / Quality plan', group: 'Risk & quality', chainKey: 'itp', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><ItpChainTab /></React.Suspense> },
        { key: 'project_risk', label: 'Risk analysis (EMV/SRA)', group: 'Risk & quality', chainKey: 'project_risk', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><ProjectRiskChainTab /></React.Suspense> },
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
        { key: 'insurance_claims', label: 'Insurance claims', group: 'Finance', chainKey: 'insurance_claim', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><InsuranceClaimChainTab /></React.Suspense> },
        { key: 'bonds', label: 'Bonds', group: 'Finance', chainKey: 'ipp_performance_bonds', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><BondRegistryTab /></React.Suspense> },
        { key: 'progress-claims', label: 'Progress claims', group: 'Finance', chainKey: 'ipp_progress_claim', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppProgressClaimTab /></React.Suspense> },
        { key: 'cp-tracker', label: 'Conditions Precedent (W192)', group: 'Finance', chainKey: 'cp_tracker', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppCpTrackerTab /></React.Suspense> },
        { key: 'green-bond-reports', label: 'Green bond reports (W202)', group: 'Finance', chainKey: 'green_bond_report', body: ({ onRefresh }) => <GreenBondReportTab onRefresh={onRefresh} /> },
        { key: 'dscr-reports', label: 'DSCR reports (W212)', group: 'Finance', chainKey: 'dscr_report', body: ({ onRefresh }) => <DscrReportTab onRefresh={onRefresh} /> },
        { key: 'credit_insurance', label: 'Credit insurance (W218)', group: 'Finance', chainKey: 'credit_insurance', body: ({ onRefresh }) => <CreditInsuranceTab onRefresh={onRefresh} /> },
        { key: 'take-or-pay-claims', label: 'Take-or-pay claims', group: 'Finance', chainKey: 'curtailment_claim', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><TakeOrPayChainTab /></React.Suspense> },
        { key: 'milestone-variance', label: 'Milestone variance reports (W207)', group: 'Project controls', chainKey: 'milestone_variance_report', body: ({ onRefresh }) => <MilestoneVarianceTab onRefresh={onRefresh} /> },
        { key: 'subcontractors', label: 'Subcontractors', group: 'Construction', chainKey: 'ipp_subcontractor', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppSubcontractorTab /></React.Suspense> },
        { key: 'procurement', label: 'Procurement / RFPs', group: 'Construction', chainKey: 'procurement_rfp', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><ProcurementChainTab /></React.Suspense> },
        { key: 'cod', label: 'Construction / COD', group: 'Construction', chainKey: 'cod_chain', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><CodChainTab /></React.Suspense> },
        { key: 'dfr', label: 'Daily field report', group: 'Construction', chainKey: 'dfr', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><DfrChainTab /></React.Suspense> },
        { key: 'site_diary', label: 'Site diary (W143)', group: 'Construction', chainKey: 'ipp_construction_diary', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppDiaryTab /></React.Suspense> },
        { key: 'punch_list', label: 'Punch list', group: 'Construction', chainKey: 'punch_list', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><PunchListChainTab /></React.Suspense> },
        { key: 'mir', label: 'Material inspections', group: 'Construction', chainKey: 'ipp_mir', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppMirTab /></React.Suspense> },
        { key: 'handover_dossier', label: 'Handover dossier', group: 'Construction', chainKey: 'handover_dossier', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><HandoverDossierChainTab /></React.Suspense> },
        { key: 'method-statements', label: 'Method statements', group: 'Safety & grid', chainKey: 'ipp_method_statement', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppMethodStatementTab /></React.Suspense> },
        { key: 'env-monitoring', label: 'Environmental monitoring', group: 'Safety & grid', chainKey: 'ipp_env_monitoring', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><IppEnvMonitoringTab /></React.Suspense> },
        { key: 'planned_outages', label: 'Planned outages', group: 'Safety & grid', chainKey: 'planned_outage', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><PlannedOutageChainTab /></React.Suspense> },
        { key: 'hse_chain', label: 'HSE incidents', group: 'Safety & grid', chainKey: 'hse_incident', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><HseIncidentChainTab /></React.Suspense> },
        { key: 'cyber_chain', label: 'Cyber incidents', group: 'Safety & grid', chainKey: 'cyber_incident', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><CyberIncidentChainTab /></React.Suspense> },
        { key: 'ed_chain', label: 'ED commitments', group: 'Safety & grid', chainKey: 'ed_commitment', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><EdCommitmentChainTab /></React.Suspense> },
        { key: 'gca_chain', label: 'Grid connection', group: 'Safety & grid', chainKey: 'gca_connection', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><GcaChainTab /></React.Suspense> },
        {
          key: 'warranty_claims',
          label: 'Warranty / RMA (W15)',
          group: 'Safety & grid',
          chainKey: 'warranty_claim',
          body: () => (
            <ListingTable
              endpoint="/esums/warranty-claims"
              rowKey={(r) => r.id}
              empty={{ title: 'No warranty claims', description: 'OEM warranty and RMA claims for site equipment will appear here.' }}
              columns={[
                { key: 'defect_description', label: 'Defect', render: (r) => <span className="truncate block max-w-xs" title={r.defect_description || ''}>{(r.defect_description || '—').slice(0, 60)}</span> },
                { key: 'manufacturer', label: 'OEM' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['remediated','closed'].includes(r.chain_status) ? 'good' : ['rejected','dispute'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Opened', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'connection_energization_ipp',
          label: 'Energization (W75)',
          group: 'Safety & grid',
          chainKey: 'connection_energization',
          body: () => (
            <ListingTable
              endpoint="/connection-energization/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No energization cases', description: 'SA Grid Code/NTCSA connection energization cases for this facility will appear here.' }}
              columns={[
                { key: 'connection_type', label: 'Connection type' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['commercial_operation'].includes(r.chain_status) ? 'good' : ['withdrawn','suspended'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Initiated', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        { key: 'gtia', label: 'GTIA (W224)', group: 'Safety & grid', body: ({ onRefresh }) => <GtiaTab onRefresh={onRefresh} /> },
        { key: 'community', label: 'Community', group: 'Safety & grid', body: ({ onRefresh }) => <CommunityTab onRefresh={onRefresh} /> },
        { key: 'scada-connectors', label: 'SCADA connectors', group: 'Predictive ML', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><ScadaConnectorTab /></React.Suspense> },
        { key: 'mqtt-opcua-connectors', label: 'MQTT / OPC-UA', group: 'Predictive ML', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><MqttOpcuaConnectorTab /></React.Suspense> },
        { key: 'anomaly-detection-ml', label: 'Anomaly detection', group: 'Predictive ML', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><AnomalyDetectionMlTab /></React.Suspense> },
        { key: 'rul-prediction-ml', label: 'RUL prediction', group: 'Predictive ML', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><RulPredictionMlTab /></React.Suspense> },
        { key: 'fault-fingerprint-ml', label: 'Fault fingerprint', group: 'Predictive ML', body: () => <React.Suspense fallback={<div className="animate-pulse h-32 bg-gray-50 m-4 rounded-md" />}><FaultFingerprintMlTab /></React.Suspense> },
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

// ─── W212: DSCR Report Tab ────────────────────────────────────────────────────
const DSCR_TIER_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'info'> = {
  systemically_important: 'bad', large: 'warn', standard: 'info', emerging: 'neutral',
};

function DscrReportTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; tier: string; period: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + New DSCR report
        </button>
      </div>

      <ListingTable
        endpoint="/dscr-reports"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, tier: r.dscr_tier, period: r.reporting_period })}
        empty={{ title: 'No DSCR reports', description: 'Quarterly DSCR reports submitted to DFIs will appear here.' }}
        columns={[
          { key: 'reporting_period', label: 'Period', render: (r) => <span className="font-semibold text-[12px]">{r.reporting_period as string}</span> },
          { key: 'dscr_tier', label: 'Tier', render: (r) => <Pill tone={DSCR_TIER_TONE[r.dscr_tier as string] ?? 'neutral'}>{String(r.dscr_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'dscr_value', label: 'DSCR', render: (r) => r.dscr_value != null ? <span className={`font-semibold ${Number(r.dscr_value) >= 1.4 ? 'text-green-700' : Number(r.dscr_value) >= 1.2 ? 'text-amber-600' : 'text-red-600'}`}>{Number(r.dscr_value).toFixed(2)}x</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['accepted'].includes(r.chain_status as string) ? 'good' : ['covenant_breach'].includes(r.chain_status as string) ? 'bad' : 'warn'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'dfi_name', label: 'DFI', render: (r) => r.dfi_name ?? <span className="text-[#8fa3bd]">—</span> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at as string).toLocaleDateString() },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="New DSCR report"
          submitLabel="Create"
          fields={[
            { key: 'reporting_period', label: 'Reporting period (e.g. 2025-Q1)', required: true },
            { key: 'dscr_tier', label: 'IPP tier', type: 'select', required: true, options: [
              { value: 'emerging', label: 'Emerging (<50MW, 21d SLA)' },
              { value: 'standard', label: 'Standard (50-300MW, 30d SLA)' },
              { value: 'large', label: 'Large (>300MW, 45d SLA)' },
              { value: 'systemically_important', label: 'Systemically important (60d SLA)' },
            ]} as FieldSpec,
            { key: 'dfi_name', label: 'DFI name (IDC/DBSA/Nedbank/etc.)' },
            { key: 'dfi_reference', label: 'DFI loan reference' },
            { key: 'minimum_dscr_covenant', label: 'Minimum DSCR covenant (default 1.20)', type: 'number' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/dscr-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, minimum_dscr_covenant: v.minimum_dscr_covenant ? Number(v.minimum_dscr_covenant) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`DSCR — ${modal.tier} — ${modal.period}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'start_calculation', label: 'Start calculation' },
              { value: 'submit_to_ie', label: 'Submit to Independent Engineer' },
              { value: 'ie_certify', label: 'IE certify' },
              { value: 'submit_to_dfi', label: 'Submit to DFI' },
              { value: 'raise_dfi_query', label: 'DFI raises query' },
              { value: 'respond_to_queries', label: 'Respond to DFI queries' },
              { value: 'accept', label: 'DFI accepts report' },
              { value: 'flag_breach', label: 'Flag covenant breach' },
              { value: 'withdraw', label: 'Withdraw report' },
            ]} as FieldSpec,
            { key: 'net_revenue_zar', label: 'Net revenue (ZAR)', type: 'number' },
            { key: 'operating_costs_zar', label: 'Operating costs (ZAR)', type: 'number' },
            { key: 'debt_service_zar', label: 'Debt service (ZAR)', type: 'number' },
            { key: 'dscr_value', label: 'DSCR value (e.g. 1.35)', type: 'number' },
            { key: 'ie_name', label: 'Independent Engineer name' },
            { key: 'ie_certification_ref', label: 'IE certification reference' },
            { key: 'dfi_query_details', label: 'DFI query details', type: 'textarea' },
            { key: 'ipp_response_summary', label: 'IPP query response summary', type: 'textarea' },
            { key: 'breach_dscr', label: 'Breach DSCR value', type: 'number' },
            { key: 'cure_period_days', label: 'Cure period (days)', type: 'number' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/dscr-reports/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                net_revenue_zar: v.net_revenue_zar ? Number(v.net_revenue_zar) : undefined,
                operating_costs_zar: v.operating_costs_zar ? Number(v.operating_costs_zar) : undefined,
                debt_service_zar: v.debt_service_zar ? Number(v.debt_service_zar) : undefined,
                dscr_value: v.dscr_value ? Number(v.dscr_value) : undefined,
                breach_dscr: v.breach_dscr ? Number(v.breach_dscr) : undefined,
                cure_period_days: v.cure_period_days ? Number(v.cure_period_days) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

// ── W218: IPP Offtake Credit Insurance (ECIC/ATIDI/Lloyd's/MIGA) ─────────────
const CI_TIER_TONE: Record<string, string> = {
  short_term: 'bg-blue-50 text-blue-700',
  medium_term: 'bg-purple-50 text-purple-700',
  long_term: 'bg-amber-50 text-amber-700',
  project_finance: 'bg-rose-50 text-rose-700',
};

function ciStatusTone(s: string): string {
  if (['claim_paid'].includes(s)) return 'bg-green-100 text-green-800';
  if (['lapsed', 'declined'].includes(s)) return 'bg-red-100 text-red-800';
  if (['cancelled'].includes(s)) return 'bg-gray-100 text-gray-600';
  if (['claim_lodged', 'claim_assessed'].includes(s)) return 'bg-orange-100 text-orange-800';
  if (['active'].includes(s)) return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

type CiModal = { id: string; insurance_tier: string; insurer_name?: string } | null;

function CreditInsuranceTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<any[]>([]);
  const [kpis, setKpis] = React.useState<any>({});
  const [modal, setModal] = React.useState<CiModal>(null);
  const [createModal, setCreateModal] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/credit-insurance', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(j => { setData(j.data ?? []); setKpis(j.kpis ?? {}); });
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', val: kpis.total ?? 0 },
          { label: 'Active', val: kpis.active ?? 0 },
          { label: 'Claims in progress', val: kpis.claims_in_progress ?? 0 },
          { label: 'Lapsed / cancelled', val: kpis.lapsed_or_cancelled ?? 0 },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-semibold text-gray-900">{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{data.length} policies</span>
        <button
          onClick={() => setCreateModal(true)}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
        >+ New policy application</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Insurer', 'Tier', 'Type', 'Cover (ZAR)', 'Status', 'SLA deadline', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((row: any) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">{row.insurer_name ?? row.policy_ref ?? row.id.slice(0, 8)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${CI_TIER_TONE[row.insurance_tier] ?? 'bg-gray-100 text-gray-700'}`}>
                    {row.insurance_tier?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">{row.insurance_type?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="px-3 py-2 text-gray-700">{row.cover_amount_zar ? `R${Number(row.cover_amount_zar).toLocaleString()}` : '—'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ciStatusTone(row.chain_status)}`}>
                    {row.chain_status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.sla_deadline ? new Date(row.sla_deadline).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => setModal({ id: row.id, insurance_tier: row.insurance_tier, insurer_name: row.insurer_name })}
                    className="text-xs text-blue-600 hover:underline">Action</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No credit insurance policies found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createModal && (
        <ActionModal
          title="New credit insurance application"
          submitLabel="Submit application"
          fields={[
            { key: 'insurance_tier', label: 'Insurance tier', type: 'select', required: true, options: [
              { value: 'short_term', label: 'Short-term (1-3 years)' },
              { value: 'medium_term', label: 'Medium-term (3-7 years)' },
              { value: 'long_term', label: 'Long-term (7-15 years)' },
              { value: 'project_finance', label: 'Project finance (15-25 years)' },
            ]} as FieldSpec,
            { key: 'insurance_type', label: 'Insurance type', type: 'select', options: [
              { value: 'political_risk', label: 'Political risk' },
              { value: 'credit_risk', label: 'Credit risk' },
              { value: 'comprehensive', label: 'Comprehensive' },
              { value: 'miga_guarantee', label: 'MIGA guarantee' },
              { value: 'ecic_cover', label: 'ECIC cover' },
              { value: 'atidi_cover', label: 'ATIDI cover' },
              { value: 'lloyds_syndicate', label: "Lloyd's syndicate" },
            ]} as FieldSpec,
            { key: 'insurer_name', label: 'Insurer name' },
            { key: 'cover_amount_zar', label: 'Cover amount (ZAR)', type: 'number' },
            { key: 'cover_period_years', label: 'Cover period (years)', type: 'number' },
            { key: 'project_ref', label: 'Project reference' },
            { key: 'reason', label: 'Application notes' },
          ] as FieldSpec[]}
          onClose={() => setCreateModal(false)}
          onSubmit={async (v) => {
            const res = await fetch('/api/credit-insurance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                cover_amount_zar: v.cover_amount_zar ? Number(v.cover_amount_zar) : undefined,
                cover_period_years: v.cover_period_years ? Number(v.cover_period_years) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreateModal(false); bump();
          }}
        />
      )}

      {modal && (
        <ActionModal
          title={`Credit insurance — ${modal.insurance_tier?.replace(/_/g, ' ')} — ${modal.insurer_name ?? modal.id.slice(0, 8)}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'commence_underwriting', label: 'Commence underwriting' },
              { value: 'issue_terms', label: 'Issue terms / term-sheet' },
              { value: 'commence_negotiation', label: 'Commence negotiation' },
              { value: 'bind_policy', label: 'Bind policy' },
              { value: 'activate', label: 'Activate / renew policy' },
              { value: 'flag_renewal', label: 'Flag renewal due' },
              { value: 'lodge_claim', label: 'Lodge claim' },
              { value: 'complete_assessment', label: 'Complete claim assessment' },
              { value: 'pay_claim', label: 'Pay claim' },
              { value: 'lapse', label: 'Lapse (unpaid premium)' },
              { value: 'cancel', label: 'Cancel policy' },
              { value: 'decline', label: 'Decline application / claim' },
            ]} as FieldSpec,
            { key: 'terms_ref', label: 'Terms reference' },
            { key: 'policy_ref', label: 'Policy reference' },
            { key: 'premium_rate_pct', label: 'Premium rate (%)', type: 'number' },
            { key: 'annual_premium_zar', label: 'Annual premium (ZAR)', type: 'number' },
            { key: 'cover_amount_zar', label: 'Cover amount (ZAR)', type: 'number' },
            { key: 'policy_inception', label: 'Policy inception date' },
            { key: 'policy_expiry', label: 'Policy expiry date' },
            { key: 'renewal_due_date', label: 'Renewal due date' },
            { key: 'claim_event', label: 'Claim trigger event description' },
            { key: 'claim_amount_zar', label: 'Claim amount (ZAR)', type: 'number' },
            { key: 'claim_paid_amount_zar', label: 'Claim paid amount (ZAR)', type: 'number' },
            { key: 'claim_decline_reason', label: 'Decline reason' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/credit-insurance/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                premium_rate_pct: v.premium_rate_pct ? Number(v.premium_rate_pct) : undefined,
                annual_premium_zar: v.annual_premium_zar ? Number(v.annual_premium_zar) : undefined,
                cover_amount_zar: v.cover_amount_zar ? Number(v.cover_amount_zar) : undefined,
                claim_amount_zar: v.claim_amount_zar ? Number(v.claim_amount_zar) : undefined,
                claim_paid_amount_zar: v.claim_paid_amount_zar ? Number(v.claim_paid_amount_zar) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
        />
      )}
    </div>
  );
}

// ── W221: Grid Export Curtailment & Compensation Claim ────────────────────────
const EC_TIER_TONE: Record<string, string> = {
  minor:       'bg-blue-50 text-blue-700',
  moderate:    'bg-purple-50 text-purple-700',
  significant: 'bg-amber-50 text-amber-700',
  systemic:    'bg-rose-50 text-rose-700',
};

function ecStatusTone(s: string): string {
  if (['settled'].includes(s)) return 'bg-green-100 text-green-800';
  if (['rejected', 'withdrawn', 'cancelled'].includes(s)) return 'bg-red-100 text-red-800';
  if (['disputed', 'arbitration'].includes(s)) return 'bg-orange-100 text-orange-800';
  if (['claim_submitted', 'under_review'].includes(s)) return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

type EcModal = { id: string; curtailment_tier: string; deemed_energy_mwh?: number } | null;

function ExportCurtailmentTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<any[]>([]);
  const [kpis, setKpis] = React.useState<any>({});
  const [modal, setModal] = React.useState<EcModal>(null);
  const [createModal, setCreateModal] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/export-curtailments', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(j => { setData(j.data ?? []); setKpis(j.kpis ?? {}); });
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total claims', val: kpis.total ?? 0 },
          { label: 'Active', val: kpis.active ?? 0 },
          { label: 'Settled', val: kpis.settled ?? 0 },
          { label: 'Disputed', val: kpis.disputed ?? 0 },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-semibold text-gray-900">{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>
      {(kpis.total_deemed_mwh > 0 || kpis.total_claim_zar > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <div className="text-xl font-semibold text-amber-800">{kpis.total_deemed_mwh?.toLocaleString()} MWh</div>
            <div className="text-xs text-amber-600 mt-0.5">Total deemed energy</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xl font-semibold text-green-800">R{kpis.total_claim_zar?.toLocaleString()}</div>
            <div className="text-xs text-green-600 mt-0.5">Total claim value</div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{data.length} curtailment claims</span>
        <button
          onClick={() => setCreateModal(true)}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
        >+ Log curtailment event</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Tier', 'Type', 'Duration (h)', 'Deemed MWh', 'Claim (ZAR)', 'Status', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((row: any) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${EC_TIER_TONE[row.curtailment_tier] ?? 'bg-gray-100 text-gray-700'}`}>
                    {row.curtailment_tier}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">{row.curtailment_type?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="px-3 py-2 text-gray-700">{row.curtailment_duration_h ?? '—'}</td>
                <td className="px-3 py-2 text-gray-700">{row.deemed_energy_mwh ? `${row.deemed_energy_mwh} MWh` : '—'}</td>
                <td className="px-3 py-2 text-gray-700">{row.claim_amount_zar ? `R${Number(row.claim_amount_zar).toLocaleString()}` : '—'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ecStatusTone(row.chain_status)}`}>
                    {row.chain_status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => setModal({ id: row.id, curtailment_tier: row.curtailment_tier, deemed_energy_mwh: row.deemed_energy_mwh })}
                    className="text-xs text-blue-600 hover:underline">Action</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No curtailment claims found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createModal && (
        <ActionModal
          title="Log grid export curtailment event"
          submitLabel="Log event"
          fields={[
            { key: 'curtailment_tier', label: 'Curtailment tier', type: 'select', required: true, options: [
              { value: 'minor', label: 'Minor (<500 MWh)' },
              { value: 'moderate', label: 'Moderate (500–2000 MWh)' },
              { value: 'significant', label: 'Significant (2000–10000 MWh)' },
              { value: 'systemic', label: 'Systemic (>10000 MWh)' },
            ]} as FieldSpec,
            { key: 'curtailment_type', label: 'Curtailment type', type: 'select', options: [
              { value: 'network_congestion', label: 'Network congestion' },
              { value: 'load_management', label: 'Load management' },
              { value: 'emergency_curtailment', label: 'Emergency curtailment' },
              { value: 'planned_maintenance', label: 'Planned maintenance' },
              { value: 'frequency_deviation', label: 'Frequency deviation' },
              { value: 'voltage_violation', label: 'Voltage violation' },
            ]} as FieldSpec,
            { key: 'site_id', label: 'Site ID' },
            { key: 'so_curtailment_ref', label: 'SO curtailment reference' },
            { key: 'ppa_ref', label: 'PPA reference (W22)' },
            { key: 'curtailment_start', label: 'Curtailment start (ISO 8601)' },
            { key: 'curtailment_end', label: 'Curtailment end (ISO 8601)' },
            { key: 'curtailment_duration_h', label: 'Duration (hours)', type: 'number' },
            { key: 'available_capacity_mw', label: 'Available capacity (MW)', type: 'number' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setCreateModal(false)}
          onSubmit={async (v) => {
            const res = await fetch('/api/export-curtailments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                curtailment_duration_h: v.curtailment_duration_h ? Number(v.curtailment_duration_h) : undefined,
                available_capacity_mw: v.available_capacity_mw ? Number(v.available_capacity_mw) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreateModal(false); bump();
          }}
        />
      )}

      {modal && (
        <ActionModal
          title={`Curtailment claim — ${modal.curtailment_tier} — ${modal.deemed_energy_mwh ?? '?'}MWh`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'log_notification', label: 'Log SO notification' },
              { value: 'calculate_energy', label: 'Calculate deemed energy' },
              { value: 'prepare_claim', label: 'Prepare compensation claim' },
              { value: 'submit_claim', label: 'Submit claim to SO/offtaker' },
              { value: 'acknowledge_review', label: 'Acknowledge under review' },
              { value: 'raise_dispute', label: 'Raise dispute' },
              { value: 'refer_to_arbitration', label: 'Refer to NERSA arbitration' },
              { value: 'settle', label: 'Settle claim' },
              { value: 'reject', label: 'Reject claim' },
              { value: 'withdraw', label: 'Withdraw claim' },
              { value: 'cancel', label: 'Cancel (duplicate/admin error)' },
            ]} as FieldSpec,
            { key: 'actual_generation_mwh', label: 'Actual generation during period (MWh)', type: 'number' },
            { key: 'deemed_energy_mwh', label: 'Deemed energy loss (MWh)', type: 'number' },
            { key: 'irradiance_ghi_kwh_m2', label: 'Irradiance GHI (kWh/m²)', type: 'number' },
            { key: 'tariff_rate_per_mwh', label: 'Tariff rate (R/MWh)', type: 'number' },
            { key: 'claim_amount_zar', label: 'Claim amount (ZAR)', type: 'number' },
            { key: 'compensation_paid_zar', label: 'Compensation paid (ZAR)', type: 'number' },
            { key: 'settlement_ref', label: 'Settlement reference' },
            { key: 'dispute_grounds', label: 'Dispute grounds', type: 'textarea' },
            { key: 'arbitration_ref', label: 'Arbitration reference' },
            { key: 'rejection_reason', label: 'Rejection reason' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/export-curtailments/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                actual_generation_mwh: v.actual_generation_mwh ? Number(v.actual_generation_mwh) : undefined,
                deemed_energy_mwh: v.deemed_energy_mwh ? Number(v.deemed_energy_mwh) : undefined,
                irradiance_ghi_kwh_m2: v.irradiance_ghi_kwh_m2 ? Number(v.irradiance_ghi_kwh_m2) : undefined,
                tariff_rate_per_mwh: v.tariff_rate_per_mwh ? Number(v.tariff_rate_per_mwh) : undefined,
                claim_amount_zar: v.claim_amount_zar ? Number(v.claim_amount_zar) : undefined,
                compensation_paid_zar: v.compensation_paid_zar ? Number(v.compensation_paid_zar) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
        />
      )}
    </div>
  );
}

// ─── W224: IPP Grid Technical Interface Agreement (GTIA) ─────────────────────
const GTIA_TIER_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'bad'> = {
  small: 'neutral', medium: 'info', large: 'warn', bulk: 'bad',
};

function gtiaStatusTone(s: string): 'good' | 'bad' | 'warn' | 'neutral' | 'info' {
  if (s === 'gtia_executed') return 'good';
  if (s === 'ipp_rejected' || s === 'so_rejected') return 'bad';
  if (s === 'protection_settings_agreed' || s === 'scada_interface_agreed') return 'warn';
  if (s === 'so_under_review') return 'info';
  return 'neutral';
}

type GtiaModal = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function GtiaTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<GtiaModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          className="px-3 py-1.5 rounded bg-[#1a3a5c] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New GTIA
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/gtia"
        rowKey={(r) => r.id}
        empty={{ title: 'No GTIAs', description: 'Initiate a Grid Technical Interface Agreement to document protection and SCADA settings with the network operator.' }}
        columns={[
          { key: 'network_operator_name', label: 'Network operator', render: (r) => String(r.network_operator_name ?? '—').slice(0, 24) },
          { key: 'gtia_tier', label: 'Tier', render: (r) => <Pill tone={GTIA_TIER_TONE[String(r.gtia_tier)] ?? 'neutral'}>{String(r.gtia_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'installed_capacity_mw', label: 'Capacity', align: 'right', render: (r) => r.installed_capacity_mw != null ? `${r.installed_capacity_mw} MW` : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={gtiaStatusTone(String(r.chain_status))}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">On track</Pill> },
          { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(String(r.updated_at)).toLocaleDateString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New GTIA"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/gtia', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                gtia_tier: v.gtia_tier,
                network_operator_name: v.network_operator_name || undefined,
                project_ref: v.project_ref || undefined,
                gca_ref: v.gca_ref || undefined,
                installed_capacity_mw: v.installed_capacity_mw ? Number(v.installed_capacity_mw) : undefined,
                connection_voltage_kv: v.connection_voltage_kv ? Number(v.connection_voltage_kv) : undefined,
                connection_type: v.connection_type || undefined,
                scada_protocol: v.scada_protocol || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'network_operator_name', label: 'Network operator name', required: true },
            { key: 'gtia_tier', label: 'GTIA tier', type: 'select', required: true, defaultValue: 'medium', options: [
              { value: 'small', label: 'Small (<10 MW, 7d SLA)' },
              { value: 'medium', label: 'Medium (10–100 MW, 14d SLA)' },
              { value: 'large', label: 'Large (100–500 MW, 21d SLA)' },
              { value: 'bulk', label: 'Bulk (>500 MW, 28d SLA)' },
            ]},
            { key: 'installed_capacity_mw', label: 'Installed capacity (MW)', type: 'number', required: false },
            { key: 'connection_voltage_kv', label: 'Connection voltage (kV)', type: 'number', required: false },
            { key: 'connection_type', label: 'Connection type', type: 'select', required: false, options: [
              { value: 'transmission', label: 'Transmission' },
              { value: 'sub_transmission', label: 'Sub-transmission' },
              { value: 'distribution', label: 'Distribution' },
              { value: 'embedded', label: 'Embedded' },
            ]},
            { key: 'scada_protocol', label: 'SCADA protocol', type: 'select', required: false, options: [
              { value: 'iec61850', label: 'IEC 61850' },
              { value: 'dnp3', label: 'DNP3' },
              { value: 'modbus', label: 'Modbus' },
              { value: 'iec104', label: 'IEC 104' },
              { value: 'proprietary', label: 'Proprietary' },
            ]},
            { key: 'project_ref', label: 'Project reference', required: false },
            { key: 'gca_ref', label: 'GCA reference (W28)', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title="GTIA action"
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/gtia/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                protection_relay_type: v.protection_relay_type || undefined,
                protection_settings_ref: v.protection_settings_ref || undefined,
                scada_protocol: v.scada_protocol || undefined,
                scada_point_list_ref: v.scada_point_list_ref || undefined,
                metering_class: v.metering_class || undefined,
                rejection_reason: v.rejection_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'initiate_gtia', label: 'Initiate GTIA process' },
              { value: 'raise_queries', label: 'Raise technical queries' },
              { value: 'respond_to_queries', label: 'Respond to queries' },
              { value: 'ipp_approve', label: 'IPP approve interface specs' },
              { value: 'commence_so_review', label: 'Commence SO review' },
              { value: 'agree_protection_settings', label: 'Agree protection relay settings' },
              { value: 'agree_scada_interface', label: 'Agree SCADA/metering interface' },
              { value: 'execute_gtia', label: 'Execute GTIA (sign & register)' },
              { value: 'ipp_reject', label: 'IPP reject interface requirements' },
              { value: 'so_reject', label: 'SO reject IPP technical specs' },
              { value: 'withdraw', label: 'Withdraw' },
            ]},
            { key: 'protection_relay_type', label: 'Protection relay type', required: false },
            { key: 'protection_settings_ref', label: 'Protection settings document ref', required: false },
            { key: 'scada_protocol', label: 'SCADA protocol', type: 'select', required: false, options: [
              { value: 'iec61850', label: 'IEC 61850' },
              { value: 'dnp3', label: 'DNP3' },
              { value: 'modbus', label: 'Modbus' },
              { value: 'iec104', label: 'IEC 104' },
            ]},
            { key: 'scada_point_list_ref', label: 'SCADA point list reference', required: false },
            { key: 'metering_class', label: 'Metering class', required: false },
            { key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}
