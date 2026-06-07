// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import type { DurableObjectNamespace, ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { idempotency } from './middleware/idempotency';
import { optionalAuth, authMiddleware, getCurrentUser } from './middleware/auth';
import { tenantQuotaMiddleware } from './middleware/tenant-quota';
import { AppError } from './utils/types';
import { HonoEnv } from './utils/types';
import './cascade-rules'; // Layer A — registers all cascade rules at boot

// Route imports
import authRoutes from './routes/auth';
import ssoRoutes from './routes/sso';
import cockpitRoutes from './routes/cockpit';
import launchRoutes from './routes/launch';
import participantsRoutes from './routes/participants';
import contractsRoutes from './routes/contracts';
import invoicesRoutes from './routes/invoices';
import projectsRoutes from './routes/projects';
import projectScheduleRoutes from './routes/project-schedule';
import riskRoutes from './routes/risk';
import clearingDisclosureRoutes from './routes/clearing-disclosure';
import settlementDvpRoutes from './routes/settlement-dvp';
import marginGateRoutes from './routes/margin-gate';
import tradingRoutes from './routes/trading';
import settlementRoutes from './routes/settlement';
import carbonRoutes from './routes/carbon';
import esgRoutes from './routes/esg';
import esgReportsRoutes from './routes/esg-reports';
import watershedRoutes, { cpPortal as counterpartyPortalRoutes } from './routes/watershed';
import platformRoutes from './routes/platform';
import roleCompletionsRoutes from './routes/role-completions';
import gridRoutes from './routes/grid';
import procurementRoutes from './routes/procurement';
import dealroomRoutes from './routes/dealroom';
import modulesRoutes from './routes/modules';
import popiaRoutes from './routes/popia';
import intelligenceRoutes from './routes/intelligence';
import briefingRoutes from './routes/briefing';
import meteringRoutes from './routes/metering';
import onaRoutes from './routes/ona';
import pipelineRoutes from './routes/pipeline';
import vaultRoutes from './routes/vault';
import threadsRoutes from './routes/threads';
import marketplaceRoutes from './routes/marketplace';
import adminRoutes from './routes/admin';
import supportRoutes from './routes/support';
import aiRoutes from './routes/ai';
import loiRoutes from './routes/lois';
import offtakerRoutes from './routes/offtaker';
import funderRoutes from './routes/funder';
import regulatorRoutes from './routes/regulator';
import regulatorSuiteRoutes from './routes/regulator-suite';
import gridOperatorRoutes from './routes/grid-operator';
import traderRiskRoutes from './routes/trader-risk';
import lenderSuiteRoutes from './routes/lender-suite';
import ippLifecycleRoutes from './routes/ipp-lifecycle';
import offtakerSuiteRoutes from './routes/offtaker-suite';
import carbonRegistryRoutes from './routes/carbon-registry';
import carbonArticle6Routes from './routes/carbon-article-6';
import regulatorInboxRoutes from './routes/regulator-inbox';
import roleActionsRoutes from './routes/role-actions';
import insightsRoutes from './routes/insights';
import lenderDunningRoutes from './routes/lender-dunning';
import offtakerObligationsRoutes from './routes/offtaker-obligations';
import gridWheelingChargesRoutes from './routes/grid-wheeling-charges';
import traderMmComplianceRoutes from './routes/trader-mm-compliance';
import ippBondsRoutes, { bondExpirySweep } from './routes/ipp-bonds';
import carbonMrvChainRoutes, { mrvChainSlaSweep } from './routes/carbon-mrv-chain';
import esumsCommissioningRoutes, { siteCommissioningSlaSweep } from './routes/esums-commissioning';
import gridDispatchNominationsRoutes, { dispatchNominationSlaSweep } from './routes/grid-dispatch-nominations';
import supportTicketChainRoutes, { supportTicketSlaSweep } from './routes/support-ticket-chain';
import warrantyClaimChainRoutes, { warrantyClaimSlaSweep } from './routes/warranty-claim-chain';
import woChainRoutes, { woChainSlaSweep } from './routes/wo-chain';
import carbonRetirementChainRoutes, { carbonRetirementSlaSweep } from './routes/carbon-retirement-chain';
import plannedOutageChainRoutes, { plannedOutageSlaSweep } from './routes/planned-outage-chain';
import procurementChainRoutes, { procurementSlaSweep } from './routes/procurement-chain';
import codChainRoutes, { codSlaSweep } from './routes/cod-chain';
import drawdownChainRoutes, { drawdownSlaSweep } from './routes/drawdown-chain';
import ppaContractChainRoutes, { ppaContractSlaSweep } from './routes/ppa-contract-chain';
import insuranceClaimChainRoutes, { insuranceClaimSlaSweep } from './routes/insurance-claim-chain';
import prChainRoutes, { prSlaSweep } from './routes/pr-chain';
import hseIncidentChainRoutes, { hseIncidentSlaSweep } from './routes/hse-incident-chain';
import cyberIncidentChainRoutes, { cyberIncidentSlaSweep } from './routes/cyber-incident-chain';
import edCommitmentChainRoutes, { edCommitmentSlaSweep } from './routes/ed-commitment-chain';
import gcaChainRoutes, { gcaSlaSweep } from './routes/gca-chain';
import poslimitChainRoutes, { poslimitSlaSweep } from './routes/poslimit-chain';
import disbursementChainRoutes, { disbursementSlaSweep } from './routes/disbursement-chain';
import dispositionChainRoutes, { dispositionSlaSweep } from './routes/disposition-chain';
import takeOrPayChainRoutes, { topSlaSweep } from './routes/take-or-pay-chain';
import licenceRenewalChainRoutes, { licenceRenewalSlaSweep } from './routes/licence-renewal-chain';
import loadCurtailmentChainRoutes, { loadCurtailmentSlaSweep } from './routes/load-curtailment-chain';
import vendorEscalationChainRoutes, { vendorEscalationSlaSweep } from './routes/vendor-escalation-chain';
import bestExecutionChainRoutes, { bestExecutionSlaSweep } from './routes/best-execution-chain';
import carbonRegistrationChainRoutes, { carbonRegistrationSlaSweep } from './routes/carbon-registration-chain';
import covenantCertificateChainRoutes, { covenantCertificateSlaSweep } from './routes/covenant-certificate-chain';
import tariffIndexationChainRoutes, { tariffIndexationSlaSweep } from './routes/tariff-indexation-chain';
import complianceInspectionChainRoutes, { complianceInspectionSlaSweep } from './routes/compliance-inspection-chain';
import problemManagementChainRoutes, { problemManagementSlaSweep } from './routes/problem-management-chain';
import carbonReversalChainRoutes, { carbonReversalSlaSweep } from './routes/carbon-reversal-chain';
import tariffDeterminationChainRoutes, { tariffDeterminationSlaSweep } from './routes/tariff-determination-chain';
import tradeReportingChainRoutes, { tradeReportingSlaSweep } from './routes/trade-reporting-chain';
import loanDefaultChainRoutes, { loanDefaultSlaSweep } from './routes/loan-default-chain';
import curtailmentClaimChainRoutes, { curtailmentClaimSlaSweep } from './routes/curtailment-claim-chain';
import changeEnablementChainRoutes, { changeEnablementSlaSweep } from './routes/change-enablement-chain';
import carbonOffsetClaimChainRoutes, { carbonOffsetClaimSlaSweep } from './routes/carbon-offset-claim-chain';
import licenceApplicationChainRoutes, { licenceApplicationSlaSweep } from './routes/licence-application-chain';
import reserveActivationChainRoutes, { reserveActivationSlaSweep } from './routes/reserve-activation-chain';
import availabilityGuaranteeChainRoutes, { availabilityGuaranteeSlaSweep } from './routes/availability-guarantee-chain';
import marketAbuseChainRoutes, { marketAbuseSlaSweep } from './routes/market-abuse-chain';
import creditOriginationChainRoutes, { creditOriginationSlaSweep } from './routes/credit-origination-chain';
import paymentSecurityChainRoutes, { paymentSecuritySlaSweep } from './routes/payment-security-chain';
import securityRemediationChainRoutes, { securityRemediationSlaSweep } from './routes/security-remediation-chain';
import creditingRenewalChainRoutes, { creditingRenewalSlaSweep } from './routes/crediting-renewal-chain';
import ssegRegistrationChainRoutes, { ssegRegistrationSlaSweep } from './routes/sseg-registration-chain';
import gridCapacityAllocationChainRoutes, { gridCapacitySlaSweep } from './routes/grid-capacity-allocation-chain';
import pmComplianceChainRoutes, { pmComplianceSlaSweep } from './routes/pm-compliance-chain';
import algoCertChainRoutes, { algoCertSlaSweep } from './routes/algo-cert-chain';
import loanTransferChainRoutes, { loanTransferSlaSweep } from './routes/loan-transfer-chain';
import ppaTerminationChainRoutes, { ppaTerminationSlaSweep } from './routes/ppa-termination-chain';
import warrantyRecoveryChainRoutes, { warrantyRecoverySlaSweep } from './routes/warranty-recovery-chain';
import permitToWorkChainRoutes, { permitToWorkSlaSweep } from './routes/permit-to-work-chain';
import carbonErpaChainRoutes, { carbonErpaSlaSweep } from './routes/carbon-erpa-chain';
import complaintResolutionChainRoutes, { complaintResolutionSlaSweep } from './routes/complaint-resolution-chain';
import gridCodeComplianceChainRoutes, { gridCodeComplianceSlaSweep } from './routes/grid-code-compliance-chain';
import counterpartyMarginChainRoutes, { counterpartyMarginSlaSweep } from './routes/counterparty-margin-chain';
import securityPerfectionChainRoutes, { securityPerfectionSlaSweep } from './routes/security-perfection-chain';
import recLifecycleChainRoutes, { recLifecycleSlaSweep } from './routes/rec-lifecycle-chain';
import assetPrognosticsChainRoutes, { assetPrognosticsSlaSweep } from './routes/asset-prognostics-chain';
import sparePartsProvisioningChainRoutes, { sparePartsProvisioningSlaSweep } from './routes/spare-parts-provisioning-chain';
import poaCpaInclusionChainRoutes, { poaCpaInclusionSlaSweep } from './routes/poa-cpa-inclusion-chain';
import levyAssessmentChainRoutes, { levyAssessmentSlaSweep } from './routes/levy-assessment-chain';
import connectionEnergizationChainRoutes, { connectionEnergizationSlaSweep } from './routes/connection-energization-chain';
import tradeAllocationChainRoutes, { tradeAllocationSlaSweep } from './routes/trade-allocation-chain';
import reserveAccountChainRoutes, { reserveAccountSlaSweep } from './routes/reserve-account-chain';
import ppaChangeInLawChainRoutes, { ppaChangeInLawSlaSweep } from './routes/ppa-change-in-law-chain';
import generationRevenueAssuranceChainRoutes, { generationRevenueAssuranceSlaSweep } from './routes/generation-revenue-assurance-chain';
import serviceContractChainRoutes, { serviceContractSlaSweep } from './routes/service-contract-chain';
import projectChangeOrderChainRoutes, { projectChangeOrderSlaSweep } from './routes/project-change-order-chain';
import carbonIssuanceChainRoutes, { carbonIssuanceSlaSweep } from './routes/carbon-issuance-chain';
import consultationNoticeChainRoutes, { consultationNoticeSlaSweep } from './routes/consultation-notice-chain';
import blackStartChainRoutes, { blackStartSlaSweep } from './routes/black-start-chain';
import settlementFailChainRoutes, { settlementFailSlaSweep } from './routes/settlement-fail-chain';
import dscrMonitoringChainRoutes, { dscrMonitoringSlaSweep } from './routes/dscr-monitoring-chain';
import ppaNominationChainRoutes, { ppaNominationSlaSweep } from './routes/ppa-nomination-chain';
import bessSohChainRoutes, { bessSohSlaSweep } from './routes/bess-soh-chain';
import oemFcoChainRoutes, { oemFcoSlaSweep } from './routes/oem-fco-chain';
import benchmarkTransitionChainRoutes, { benchmarkTransitionSlaSweep } from './routes/benchmark-transition-chain';
import ccpAssessmentChainRoutes, { ccpAssessmentSlaSweep } from './routes/ccp-assessment-chain';
import projectRiskChainRoutes, { projectRiskSlaSweep } from './routes/project-risk-chain';
import enforcementActionChainRoutes, { enforcementActionSlaSweep } from './routes/enforcement-action-chain';
import rezCapacityChainRoutes, { rezCapacitySlaSweep } from './routes/rez-capacity-chain';
import sllKpiChainRoutes, { sllKpiSlaSweep } from './routes/sll-kpi-chain';
import submittalRfiChainRoutes, { submittalRfiSlaSweep } from './routes/submittal-rfi-chain';
import dfrChainRoutes, { dfrSlaSweep } from './routes/dfr-chain';
import punchListChainRoutes, { punchListSlaSweep } from './routes/punch-list-chain';
import itpChainRoutes, { itpSlaSweep } from './routes/itp-chain';
import handoverDossierChainRoutes, { handoverDossierSlaSweep } from './routes/handover-dossier-chain';
import ppaAnnualReconChainRoutes, { ppaAnnualReconSlaSweep } from './routes/ppa-annual-recon-chain';
import soilingAuditChainRoutes, { soilingAuditSlaSweep } from './routes/soiling-audit-chain';
import esgDisclosureChainRoutes, { esgDisclosureSlaSweep } from './routes/esg-disclosure-chain';
import serviceRequestChainRoutes, { serviceRequestSlaSweep, serviceRequestEntitlementWindowSweep } from './routes/service-request-chain';
import imbalanceSettlementChainRoutes, { imbalanceSettlementSlaSweep, imbalanceSettlementArrearsSweep } from './routes/imbalance-settlement-chain';
import enforcementActionS35ChainRoutes, { enforcementActionS35SlaSweep, enforcementActionS35AppealWindowSweep } from './routes/enforcement-action-s35-chain';
import pretradeCreditChainRoutes, { pretradeCreditSlaSweep, pretradeCreditKycRecencySweep } from './routes/pretrade-credit-chain';
import loanRestructureChainRoutes, { loanRestructureSlaSweep, loanRestructureConsentDeadlineSweep } from './routes/loan-restructure-chain';
import carbonCreditRatingChainRoutes, { carbonCreditRatingSlaSweep, carbonCreditRatingMonitoringFreshnessScan } from './routes/carbon-credit-rating-chain';
import transmissionOutageChainRoutes, { transmissionOutageSlaSweep, transmissionOutageWindowMonitor } from './routes/transmission-outage-chain';
import pnlAttributionChainRoutes, { pnlAttributionSlaSweep, pnlAttributionT1EodOpener } from './routes/pnl-attribution-chain';
import ippScheduleChainRoutes, { ippScheduleSlaSweep, ippScheduleHealthRecompute } from './routes/ipp-schedule-chain';
import ippEvmChainRoutes, { ippEvmSlaSweep, ippEvmHealthRecompute } from './routes/ipp-evm-chain';
import ippDocumentControlChainRoutes, { ippDocControlSlaSweep, ippDocControlIdcMatrixRecompute } from './routes/ipp-document-control-chain';
import ippSubmittalRoute, { ippSubmittalSlaSweep, ippSubmittalCycleRefresh } from './routes/ipp-submittal';
import ippRfiRoute, { ippRfiSlaSweep, ippRfiAgingRefresh } from './routes/ipp-rfi';
import ippChangeOrderRoute, { ippChangeOrderSlaSweep, ippChangeOrderCumPctRefresh } from './routes/ipp-change-order';
import auditChainRoute, {
  auditChainSlaSweep,
  auditChainHourlyProposeSweep,
  auditChainDailyReconcileSweep,
  auditChainQuarterlyExportSweep,
} from './routes/audit-chain';
import regulatorExportRoutes, {
  regulatorExportSlaSweep,
  regulatorExportDailyRefreshSweep,
  regulatorExportMonthlyRollupSweep,
} from './routes/regulator-export';
import reconciliationAttestationRoutes, {
  reconciliationAttestationSlaSweep,
  reconciliationAttestationVarianceRecomputeSweep,
  reconciliationAttestationMonthlyAuditCommitteePackSweep,
} from './routes/reconciliation-attestation';
import controlEnvironmentAuditRoutes, {
  controlEnvironmentAuditSlaSweep,
  controlEnvironmentAuditNightlyEvidenceCoverageSweep,
  controlEnvironmentAuditAnnualAuditCycleOpenerSweep,
} from './routes/control-environment-audit';
import scadaConnectorRoutes, {
  scadaConnectorSlaSweep,
  scadaConnectorTelemetryRefreshSweep,
  scadaConnectorCertExpirySweep,
} from './routes/scada-connector';
import mqttOpcuaConnectorRoutes, {
  mqttOpcuaConnectorSlaSweep,
  mqttOpcuaConnectorTelemetryRefreshSweep,
  mqttOpcuaConnectorCertExpirySweep,
} from './routes/mqtt-opcua-connector';
import strateSwiftConnectorRoutes, {
  strateSwiftConnectorSlaSweep,
  strateSwiftConnectorReconciliationSweep,
  strateSwiftConnectorKeyExpirySweep,
} from './routes/strate-swift-connector';
import sapOracleErpConnectorRoutes, {
  sapOracleErpConnectorSlaSweep,
  sapOracleErpConnectorReconciliationSweep,
  sapOracleErpConnectorCredentialExpirySweep,
} from './routes/sap-oracle-erp-connector';
import governmentFilingConnectorRoutes, {
  governmentFilingConnectorSlaSweep,
  governmentFilingConnectorFilingDeadlineSweep,
  governmentFilingConnectorCredentialExpirySweep,
} from './routes/government-filing-connector';
import anomalyDetectionMlRoutes, {
  anomalyDetectionMlSlaSweep,
  anomalyDetectionMlDriftScan,
  anomalyDetectionMlModelCardExpirySweep,
} from './routes/anomaly-detection-ml';
import rulPredictionMlRoutes, {
  rulPredictionMlSlaSweep,
  rulPredictionMlConcordanceMonitor,
  rulPredictionMlModelCardExpirySweep,
} from './routes/rul-prediction-ml';
import faultFingerprintMlRoutes, {
  faultFingerprintMlSlaSweep,
  faultFingerprintMlClassDriftScan,
  faultFingerprintMlModelCardExpirySweep,
} from './routes/fault-fingerprint-ml';
// W130 NTT Comparison Battery - PHASE D WAVE 4 OF 4 - CLOSES PHASE D.
// Continuous-cycle aggregator stitching W127+W128+W129 vs emulated NTT
// IoT/O&M baseline. SIGNATURE: recall_certification crosses regulator
// EVERY tier (withdrawal of published savings cert always reportable).
import nttComparisonBatteryRoutes, {
  nttComparisonBatterySlaSweep,
  nttComparisonBatteryNightlyCycleRunner,
  nttComparisonBatteryModelCardExpirySweep,
  nttComparisonBatteryMonthlyLedgerReconciliation,
} from './routes/ntt-comparison-battery';
import stageGateRoutes, {
  stageGateSlaSweep,
  stageGateConditionsAgingSweep,
} from './routes/stage-gate';
import ippIssuesRoutes, { ippIssueSlaSweep } from './routes/ipp-issues';
import ippRiskRoutes, { ippRiskSlaSweep } from './routes/ipp-risk';
import ippStakeholderRoutes, { ippStakeholderSlaSweep } from './routes/ipp-stakeholder';
import ippLessonsLearnedRoutes, { ippLessonsLearnedSlaSweep } from './routes/ipp-lessons-learned';
import ippNcrRoutes, { ippNcrSlaSweep } from './routes/ipp-ncr';
import ippMethodStatementRoutes, { ippMethodStatementSlaSweep } from './routes/ipp-method-statement';
import ippEnvMonitoringRoutes, { ippEnvMonitoringSlaSweep } from './routes/ipp-env-monitoring';
import ippMirRoutes, { ippMirSlaSweep } from './routes/ipp-mir';
import ippSubcontractorRoutes, { ippSubcontractorSlaSweep } from './routes/ipp-subcontractor';
import ippProgressClaimRoutes, { ippProgressClaimSlaSweep } from './routes/ipp-progress-claim';
import ippTqRoutes, { ippTqSlaSweep } from './routes/ipp-tq';
import ippDiaryRoutes, { ippDiarySlaSweep } from './routes/ipp-diary';
import ippSiteInstructionRoutes, { ippSiteInstructionSlaSweep } from './routes/ipp-site-instruction';
import ippDlpDefectRoutes, { ippDlpDefectSlaSweep } from './routes/ipp-dlp-defect';
import ippVariationOrderRoutes, { ippVariationOrderSlaSweep } from './routes/ipp-variation-order';
import ippPaymentCertRoutes, { ippPaymentCertSlaSweep } from './routes/ipp-payment-cert';
import ippFinalCompletionRoutes, { ippFinalCompletionSlaSweep } from './routes/ipp-final-completion';
import ippOmHandoverRoutes, { ippOmHandoverSlaSweep } from './routes/ipp-om-handover';
import ippLandRegisterRoutes, { ippLandRegisterSlaSweep } from './routes/ipp-land-register';
import ippEnvClosureRoutes, { ippEnvClosureSlaSweep } from './routes/ipp-env-closure';
import ippCommissioningTestRoutes, { ippCommissioningTestSlaSweep } from './routes/ipp-commissioning-test';
import ippIeCertRoutes, { ippIeCertSlaSweep } from './routes/ipp-ie-cert';
import ippTpaRoutes, { ippTpaSlaSweep } from './routes/ipp-tpa';
import ippPpaVariationRoutes, { ippPpaVariationSlaSweep } from './routes/ipp-ppa-variation';
import ippChangeOfControlRoutes, { ippChangeOfControlSlaSweep } from './routes/ipp-change-of-control';
import ippRefinancingRoutes, { ippRefinancingSlaSweep } from './routes/ipp-refinancing';
import ippFmRoutes, { ippFmSlaSweep } from './routes/ipp-fm';
import ippAnnualReportRoutes, { ippAnnualReportSlaSweep } from './routes/ipp-annual-report';
import ippContractorDefaultRoutes, { ippContractorDefaultSlaSweep } from './routes/ipp-contractor-default';
import ippEcoReportRoutes, { ippEcoReportSlaSweep } from './routes/ipp-eco-report';
import ippLtaCertificateRoutes, { ippLtaCertificateSlaSweep } from './routes/ipp-lta-certificate';
import ippLandAmendmentRoutes, { ippLandAmendmentSlaSweep } from './routes/ipp-land-amendment';
import ippCommunityTrustRoutes, { ippCommunityTrustSlaSweep } from './routes/ipp-community-trust';
import ippGridComplianceRoutes, { ippGridComplianceSlaSweep } from './routes/ipp-grid-compliance';
import ippCccRoutes, { ippCccSlaSweep } from './routes/ipp-ccc';
import ippOmContractRoutes, { ippOmContractSlaSweep } from './routes/ipp-om-contract';
import ippBfsRoutes, { ippBfsSlaSweep } from './routes/ipp-bfs';
import ippEaAmendmentRoutes, { ippEaAmendmentSlaSweep } from './routes/ipp-ea-amendment';
import ippWulRoutes, { ippWulSlaSweep } from './routes/ipp-wul';
import ippHraRoutes, { ippHraSlaSweep } from './routes/ipp-hra';
import ippAelRoutes, { ippAelSlaSweep } from './routes/ipp-ael';
import ippForceMajeureRoutes, { ippForceMajeureSlaSweep } from './routes/ipp-force-majeure';
import ippLcReportRoutes, { ippLcReportSlaSweep } from './routes/ipp-lc-report';
import ippMilestoneCertRoutes, { ippMilestoneCertSlaSweep } from './routes/ipp-milestone-cert';
import ippEsmrRoutes, { ippEsmrSlaSweep } from './routes/ipp-esmr';
import ippIeAnnualReviewRoutes, { ippIeAnnualReviewSlaSweep } from './routes/ipp-iear';
import ippInsuranceRenewalRoutes, { ippInsuranceRenewalSlaSweep } from './routes/ipp-insr';
import ippPerfSecurityRoutes, { ippPerfSecuritySlaSweep } from './routes/ipp-perf-security';
import ippCepComplianceRoutes, { ippCepComplianceSlaSweep } from './routes/ipp-cep-compliance';
import ippSedComplianceRoutes, { ippSedComplianceSlaSweep } from './routes/ipp-sed-compliance';
import ippBbbeeVerificationRoutes, { ippBbbeeVerificationSlaSweep } from './routes/ipp-bbbee-verification';
import ippLenderReportingRoutes, { ippLenderReportingSlaSweep } from './routes/ipp-lender-reporting';
import ippLicenceReturnsRoutes, { ippLicenceReturnSlaSweep } from './routes/ipp-licence-returns';
import ippReippppReportsRoutes, { ippReippppReportSlaSweep } from './routes/ipp-reipppp-reports';
import ippEquityTransferRoutes, { ippEquityTransferSlaSweep } from './routes/ipp-equity-transfer';
import ippQuarterlyGenReportRoutes, { ippQuarterlyGenReportSlaSweep } from './routes/ipp-quarterly-gen-reports';
import ippAnnualComplianceAssessmentRoutes, { ippAnnualComplianceAssessmentSlaSweep } from './routes/ipp-annual-compliance-assessments';
import ippAnnualAuditRoutes, { ippAnnualAuditSlaSweep } from './routes/ipp-annual-audits';
import ippEmpComplianceReportRoutes, { ippEmpComplianceReportSlaSweep } from './routes/ipp-emp-compliance-reports';
import ippCpTrackerRoutes, { ippCpTrackerSlaSweep } from './routes/ipp-cp-tracker';
import ippLicenceObligationRoutes, { ippLicenceObligationSlaSweep } from './routes/ipp-licence-obligations';
import { facilityAmendmentRoutes, facilityAmendmentSlaSweep } from './routes/facility-amendment-chain';

import { esapComplianceRoutes, esapComplianceSlaSweep } from './routes/esap-compliance-chain';
import { protectionRelayRoutes, protectionRelaySlaSweep } from './routes/protection-relay-chain';
import { unservedEnergyRoutes, unservedEnergySlaSweep } from './routes/unserved-energy-chain';
import stationParticipantLinkRoutes, { stationParticipantLinkSlaSweep } from './routes/station-participant-links';
import adminPlatformRoutes from './routes/admin-platform';
import settlementAutoRoutes from './routes/settlement-automation';
import imbalanceRoutes from './routes/imbalance';
import dataTierRoutes from './routes/data-tier';
import aiBriefsRoutes from './routes/ai-briefs';
import realtimeRoutes from './routes/realtime';
import siemRoutes, { dispatchAllForwarders } from './routes/siem';
import reportsRoutes from './routes/reports';
import telemetryRoutes from './routes/telemetry';
import monitoringRoutes from './routes/monitoring';
import adminRevenueRoutes from './routes/admin-revenue';
import { logger } from './utils/logger';
import backupRoutes from './routes/backup';
import searchRoutes from './routes/search';
import notificationsRoutes from './routes/notifications';
import scheduleRoutes from './routes/schedule';
import esumsOmRoutes from './routes/esums-om';
import esumsOmIntelRoutes from './routes/esums-om-intel';
import esumsOmAnalysisRoutes from './routes/esums-om-analysis';
import { portalAdmin as esumsOmPortalAdmin, portalPublic as esumsOmPortalPublic } from './routes/esums-om-portal';
import esumsIngestRoutes from './routes/esums-ingest';
import esumsDataSourcesRoutes from './routes/esums-data-sources';
import esumsProjectsRoutes from './routes/esums-projects';
import esumsOmSolaxRoutes from './routes/esums-solax';
import esumsManufacturersRoutes from './routes/esums-manufacturers';
import esumsAccrualsRoutes, { computeStationAccruals, esumsInvoiceRoutes, esumsCreditRoutes } from './routes/esums-accruals';
import { runFaultEngine } from './utils/esums-fault-engine';
import platformFeaturesRoutes from './routes/platform-features';
import onboardingRoutes from './routes/onboarding';
import {
  mfa as mfaRoutes,
  kyc as kycRoutes,
  consent as consentRoutes,
  popia as popiaSelfServiceRoutes,
  regulator as regulatorReportRoutes,
  status as publicStatusRoutes,
} from './routes/go-live';
import authDeepRoutes from './routes/auth-deep';
import kycDeepRoutes from './routes/kyc-deep';
import { admin as statusDeepAdmin, pub as statusDeepPub } from './routes/status-deep';
import popiaDeepRoutes from './routes/popia-deep';
import reportsDeepRoutes from './routes/reports-deep';
import tradingDeepRoutes from './routes/trading-deep';
import settlementDeepRoutes from './routes/settlement-deep';
import { ipp as ippDeepRoutes, lender as lenderDeepRoutes, carbon as carbonDeepRoutes } from './routes/depth-3';
import gridL5Routes from './routes/grid-l5';
import { admin as regulatorL5Admin, pub as regulatorL5Pub } from './routes/regulator-l5';
import tradingClearingL5Routes from './routes/trading-clearing-l5';
import { admin as auditL5Admin, pub as auditL5Pub } from './routes/audit-l5';
import marketplaceL5Routes from './routes/marketplace-l5';
import aiAssistantRoutes from './routes/ai-assistant';
import polishRoutes from './routes/polish';
import publicLegalRoutes from './routes/public-legal';
import businessDepthRoutes, { computeLatePaymentFees } from './routes/business-depth';
import bulkOpsRoutes from './routes/bulk-ops';
import uxStateRoutes from './routes/ux-state';
import documentsRoutes from './routes/documents';
import pdfRoutes from './routes/pdf';
import rbacRoutes from './routes/rbac';
import { fireCascade } from './utils/cascade';
import { computeDisclosure, evaluateBreaches } from './utils/disclosure';
import printPacksRoutes from './routes/print-packs';
import kycChainRoutes, { kycSlaSweep } from './routes/kyc-chain';
import smartMeterChainRoutes, { smaSlaSweep } from './routes/smart-meter-chain';
import carbonTaxChainRoutes, { ctrSlaSweep } from './routes/carbon-tax-chain';
import fsccChainRoutes, { fsccSlaSweep } from './routes/fsca-compliance-chain';
import greenBondChainRoutes, { gbrSlaSweep } from './routes/green-bond-chain';
import capAdequacyChainRoutes, { capSlaSweep } from './routes/capital-adequacy-chain';
import slbKpiChainRoutes, { slbSlaSweep } from './routes/slb-kpi-chain';
import demandResponseChainRoutes, { drSlaSweep } from './routes/demand-response-chain';
import carbonRegistryTransferChainRoutes, { crtSlaSweep } from './routes/carbon-registry-transfer-chain';
import milestoneVarianceChainRoutes, { mvsSlaSweep } from './routes/milestone-variance-chain';
import csatChainRoutes, { csatSlaSweep } from './routes/csat-chain';
import publicConsultationChainRoutes, { pcSlaSweep } from './routes/public-consultation-chain';
import greenTariffChainRoutes, { gtSlaSweep } from './routes/green-tariff-chain';
import substationAssetChainRoutes, { sasSlaSweep } from './routes/substation-asset-chain';
import dscrReportChainRoutes, { dscrSlaSweep } from './routes/dscr-report-chain';
import methodologyAmendmentChainRoutes, { maSlaSweep } from './routes/methodology-amendment-chain';
import esapMonitoringChainRoutes, { esapSlaSweep } from './routes/esap-monitoring-chain';
import eopActivationChainRoutes, { eopSlaSweep } from './routes/eop-activation-chain';
import fscaConductReportChainRoutes, { fcrSlaSweep } from './routes/fsca-conduct-report-chain';
import slaPerformanceReportChainRoutes, { sprSlaSweep } from './routes/sla-performance-report-chain';
import creditInsuranceChainRoutes, { ciSlaSweep } from './routes/credit-insurance-chain';
import wheelingAccessChainRoutes, { wheelSlaSweep } from './routes/wheeling-access-chain';
import marketConductExamChainRoutes, { mceSlaSweep } from './routes/market-conduct-exam-chain';
import exportCurtailmentChainRoutes, { ecSlaSweep } from './routes/export-curtailment-chain';
import crossBorderTradeChainRoutes, { cbtSlaSweep } from './routes/cross-border-trade-chain';
import cpClearanceChainRoutes, { cpSlaSweep } from './routes/cp-clearance-chain';
import gtiaChainRoutes, { gtiaSlaSweep } from './routes/gtia-chain';
import scope3DisclosureChainRoutes, { s3SlaSweep } from './routes/scope3-disclosure-chain';
import vcmProjectDevelopmentChainRoutes, { vcmProjectSlaSweep } from './routes/vcm-project-development-chain';
import carbonBudgetChainRoutes, { carbonBudgetSlaSweep } from './routes/carbon-budget-chain';
import recDeviceRegistrationChainRoutes, { recDeviceSlaSweep } from './routes/rec-device-registration-chain';
import recIssuanceChainRoutes, { recIssuanceSlaSweep } from './routes/rec-issuance-chain';
import vcmOrderBookRoutes from './routes/vcm-order-book';
import sustainabilityMarketplaceRoutes, { listingSlaSweep } from './routes/sustainability-marketplace';
import sustainabilityTransactionChainRoutes, { transactionSlaSweep } from './routes/sustainability-transaction-chain';
import certBundleChainRoutes, { certBundleSlaSweep } from './routes/certificate-bundle-chain';

// Durable Object exports — required for Cloudflare to resolve the
// [[durable_objects.bindings]] class_name references in wrangler.toml.
export { OrderBook } from './do/order-book';

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', securityHeaders);
app.use('*', corsMiddleware);
app.use('*', rateLimitMiddleware);
app.use('*', requestLogger);
// optionalAuth runs BEFORE idempotency so the idempotency middleware can
// scope stored keys by authenticated participant (c.get('auth')?.user),
// not fall back to 'anon' and collide across callers. optionalAuth is
// non-failing (anonymous requests still pass through) so this is safe to
// attach globally.
app.use('*', optionalAuth);
// Idempotency (no-op unless caller sends Idempotency-Key; see migration 013)
app.use('*', idempotency);
// Tenant-scoped quotas — runs after optionalAuth so we know the tenant, and
// after idempotency so replays skip the counter. No-op when no tenant rule
// is configured (falls open).
app.use('/api/*', tenantQuotaMiddleware);

// Basic health check — always responds 200 so uptime monitors see a
// stable signal. Detailed probe lives at /api/health/deep.
app.get('/api/health', (c) => c.json({
  status: 'healthy',
  version: '1.0.0',
  // Tiny capabilities envelope the SPA reads to self-disable AI surfaces
  // when the operator has flipped the kill-switch (saves Workers-AI spend).
  features: {
    ai_enabled: !((c.env as any).OE_AI_DISABLED === '1' || (c.env as any).OE_AI_DISABLED === 'true'),
  },
}));

// Deep health probe — exercises every Cloudflare binding the platform
// depends on. Returns 200 iff every subsystem responds; otherwise 503
// with a per-subsystem breakdown. Cheap by design: one query per binding,
// each with LIMIT 1.
app.get('/api/health/deep', async (c) => {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; latency_ms: number; code?: string }> = {};

  async function probe<T>(name: string, fn: () => Promise<T>): Promise<void> {
    const t = Date.now();
    try {
      await fn();
      checks[name] = { ok: true, latency_ms: Date.now() - t };
    } catch (err) {
      const code = (err as Error).message === 'binding_absent' ? 'binding_absent' : 'probe_failed';
      checks[name] = { ok: false, latency_ms: Date.now() - t, code };
    }
  }

  await Promise.all([
    probe('d1_main', async () => {
      await c.env.DB.prepare('SELECT 1 AS ok').first();
    }),
    probe('d1_metering_current', async () => {
      const current = (c.env as unknown as { METERING_DB_CURRENT?: { prepare: (sql: string) => { first: () => Promise<unknown> } } }).METERING_DB_CURRENT;
      if (!current) throw new Error('binding_absent');
      await current.prepare('SELECT 1 AS ok').first();
    }),
    probe('kv', async () => {
      await c.env.KV.put('health:probe', String(Date.now()), { expirationTtl: 60 });
      await c.env.KV.get('health:probe');
    }),
    probe('r2', async () => {
      // HEAD is cheaper than GET; we don't care what's there, only that the
      // bucket is reachable.
      await c.env.R2.head('health/probe').catch(() => null);
    }),
    probe('order_book_do', async () => {
      const ns = (c.env as unknown as { ORDER_BOOK?: { idFromName: (s: string) => unknown; get: (id: unknown) => { fetch: (req: Request) => Promise<Response> } } }).ORDER_BOOK;
      if (!ns) throw new Error('binding_absent');
      const id = ns.idFromName('__health__');
      const resp = await ns.get(id).fetch(new Request('https://order-book/depth', { method: 'GET' }));
      // The DO will reasonably 404 (unknown route) OR 500 on a cold
      // __health__ shard that's never had an order (the hydrate path
      // runs a SELECT that returns empty). Both mean the binding itself
      // works, which is what the health probe is checking. Only a
      // transport-level error (ns.get() throwing) is a real failure.
      if (!resp.ok && resp.status !== 404 && resp.status !== 500) {
        throw new Error(`do_status_${resp.status}`);
      }
    }),
    probe('ai', async () => {
      if (!c.env.AI) throw new Error('binding_absent');
      // No-op probe — the binding check alone is the useful signal; a real
      // .run() would cost an AI token charge which we don't want on every
      // health poll.
    }),
  ]);

  const allOk = Object.values(checks).every((c) => c.ok || c.code === 'binding_absent');
  const status = allOk ? 200 : 503;
  return c.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      version: '1.0.0',
      total_latency_ms: Date.now() - start,
      checks,
    },
    status,
  );
});

// Auth routes
app.route('/api/auth', authRoutes);
app.route('/api/auth/sso', ssoRoutes);
app.route('/api/cockpit', cockpitRoutes);
app.route('/api/launch', launchRoutes);

// Protected routes
app.route('/api/participants', participantsRoutes);
app.route('/api/contracts', contractsRoutes);
app.route('/api/invoices', invoicesRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/projects/:projectId/schedule', projectScheduleRoutes);
app.route('/api/risk', riskRoutes);
app.route('/api/clearing/disclosure', clearingDisclosureRoutes);
app.route('/api/settlement/dvp', settlementDvpRoutes);
app.route('/api/clearing/margin-gate', marginGateRoutes);
app.route('/api/trading', tradingRoutes);
app.route('/api/role-actions', roleActionsRoutes);
app.route('/api/insights', insightsRoutes);
app.route('/api/settlement', settlementRoutes);
app.route('/api/carbon', carbonRoutes);
app.route('/api/esg', esgRoutes);
app.route('/api/esg-reports', esgReportsRoutes);
app.route('/api/watershed', watershedRoutes);
// Public counterparty data-collection portal — uses share_token, no JWT.
// Mounted outside watershedRoutes so its blanket authMiddleware does not
// apply to /api/portal/counterparty/:token.
app.route('/api/portal', counterpartyPortalRoutes);
// Platform-wide cross-module infrastructure (AI classifier, scenarios,
// audit chain, anomaly detection) — promotes Watershed primitives to all
// modules so each role's UI tab can use the same building blocks.
app.route('/api/platform', platformRoutes);
// Role-specific daily-workflow endpoints — IPP (epc/land/insurance/community),
// Offtaker (PPA market, demand response, bill validation), Lender
// (origination, syndication, SLL, workouts), Carbon (buffer pool, DD,
// permanence, attribution), Grid (queue, FCR, voltage, NDP), Regulator
// (consultations, hearings, determinations, fees), Trader (day-ahead,
// intraday, pre-trade-check, confirmations).
app.route('/api/roles', roleCompletionsRoutes);
app.route('/api/grid', gridRoutes);
app.route('/api/procurement', procurementRoutes);
app.route('/api/dealroom', dealroomRoutes);
app.route('/api/modules', modulesRoutes);
app.route('/api/popia', popiaRoutes);
app.route('/api/intelligence', intelligenceRoutes);
app.route('/api/briefing', briefingRoutes);
app.route('/api/metering', meteringRoutes);
app.route('/api/ona', onaRoutes);
app.route('/api/pipeline', pipelineRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/threads', threadsRoutes);
app.route('/api/marketplace', marketplaceRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/lois', loiRoutes);
app.route('/api/offtaker', offtakerRoutes);
app.route('/api/funder', funderRoutes);
app.route('/api/regulator', regulatorRoutes);
app.route('/api/regulator', regulatorSuiteRoutes);
app.route('/api/grid-operator', gridOperatorRoutes);
app.route('/api/trader-risk', traderRiskRoutes);
app.route('/api/lender', lenderSuiteRoutes);
app.route('/api/ipp', ippLifecycleRoutes);
app.route('/api/offtaker-suite', offtakerSuiteRoutes);
app.route('/api/carbon-registry', carbonRegistryRoutes);
// Wave 4 — UNFCCC Paris Agreement Article 6 ITMO corresponding-adjustment
// ledger. Flat mount avoids the basePath param-collision lesson from Wave 1.
app.route('/api/carbon/article-6', carbonArticle6Routes);
app.route('/api/regulator/inbox', regulatorInboxRoutes);
app.route('/api/lender/dunning', lenderDunningRoutes);
app.route('/api/offtaker/obligations', offtakerObligationsRoutes);
app.route('/api/grid/wheeling-charges', gridWheelingChargesRoutes);
app.route('/api/trader/mm-compliance', traderMmComplianceRoutes);
app.route('/api/ipp/bonds', ippBondsRoutes);
app.route('/api/carbon/mrv-chain', carbonMrvChainRoutes);
app.route('/api/esums/commissioning', esumsCommissioningRoutes);
app.route('/api/grid/dispatch-nominations', gridDispatchNominationsRoutes);
app.route('/api/support/ticket-chain', supportTicketChainRoutes);
app.route('/api/esums/warranty-claims', warrantyClaimChainRoutes);
app.route('/api/esums/wo-chain', woChainRoutes);
app.route('/api/carbon/retirement-chain', carbonRetirementChainRoutes);
app.route('/api/grid/planned-outages', plannedOutageChainRoutes);
app.route('/api/ipp/procurement-chain', procurementChainRoutes);
app.route('/api/ipp/cod-chain', codChainRoutes);
app.route('/api/lender/drawdown-chain', drawdownChainRoutes);
app.route('/api/offtaker/ppa-contract-chain', ppaContractChainRoutes);
app.route('/api/insurance/claim-chain', insuranceClaimChainRoutes);
app.route('/api/esums/pr-chain', prChainRoutes);
app.route('/api/hse/incident-chain', hseIncidentChainRoutes);
app.route('/api/cyber/incident-chain', cyberIncidentChainRoutes);
app.route('/api/ed/commitment-chain', edCommitmentChainRoutes);
app.route('/api/gca/connection-chain', gcaChainRoutes);
app.route('/api/poslimit/chain', poslimitChainRoutes);
app.route('/api/disbursement/chain', disbursementChainRoutes);
app.route('/api/disposition/chain', dispositionChainRoutes);
app.route('/api/take-or-pay/chain', takeOrPayChainRoutes);
app.route('/api/licence/renewal/chain', licenceRenewalChainRoutes);
app.route('/api/load-curtailment/chain', loadCurtailmentChainRoutes);
app.route('/api/esums/vendor-escalation/chain', vendorEscalationChainRoutes);
app.route('/api/best-execution/chain', bestExecutionChainRoutes);
app.route('/api/carbon-registration/chain', carbonRegistrationChainRoutes);
app.route('/api/covenant-certificate/chain', covenantCertificateChainRoutes);
app.route('/api/tariff-indexation/chain', tariffIndexationChainRoutes);
app.route('/api/compliance-inspection/chain', complianceInspectionChainRoutes);
app.route('/api/problem-management/chain', problemManagementChainRoutes);
app.route('/api/carbon-reversal/chain', carbonReversalChainRoutes);
app.route('/api/tariff-determination/chain', tariffDeterminationChainRoutes);
app.route('/api/trade-reporting/chain', tradeReportingChainRoutes);
app.route('/api/loan-default/chain', loanDefaultChainRoutes);
app.route('/api/curtailment-claim/chain', curtailmentClaimChainRoutes);
app.route('/api/change-enablement/chain', changeEnablementChainRoutes);
app.route('/api/carbon-offset-claim/chain', carbonOffsetClaimChainRoutes);
app.route('/api/licence-application/chain', licenceApplicationChainRoutes);
app.route('/api/reserve-activation/chain', reserveActivationChainRoutes);
app.route('/api/availability-guarantee/chain', availabilityGuaranteeChainRoutes);
app.route('/api/market-abuse/chain', marketAbuseChainRoutes);
app.route('/api/credit-origination/chain', creditOriginationChainRoutes);
app.route('/api/payment-security/chain', paymentSecurityChainRoutes);
app.route('/api/security-remediation/chain', securityRemediationChainRoutes);
app.route('/api/crediting-renewal/chain', creditingRenewalChainRoutes);
app.route('/api/sseg-registration/chain', ssegRegistrationChainRoutes);
app.route('/api/grid-capacity/chain', gridCapacityAllocationChainRoutes);
app.route('/api/pm-compliance/chain', pmComplianceChainRoutes);
app.route('/api/algo-cert/chain', algoCertChainRoutes);
app.route('/api/loan-transfer/chain', loanTransferChainRoutes);
app.route('/api/ppa-termination/chain', ppaTerminationChainRoutes);
app.route('/api/warranty-recovery/chain', warrantyRecoveryChainRoutes);
app.route('/api/permit-to-work/chain', permitToWorkChainRoutes);
app.route('/api/carbon-erpa/chain', carbonErpaChainRoutes);
app.route('/api/complaints/chain', complaintResolutionChainRoutes);
app.route('/api/grid-code-compliance/chain', gridCodeComplianceChainRoutes);
app.route('/api/counterparty-margin/chain', counterpartyMarginChainRoutes);
app.route('/api/security-perfection/chain', securityPerfectionChainRoutes);
app.route('/api/rec-lifecycle/chain', recLifecycleChainRoutes);
app.route('/api/asset-prognostics/chain', assetPrognosticsChainRoutes);
app.route('/api/spare-parts-provisioning/chain', sparePartsProvisioningChainRoutes);
app.route('/api/poa-inclusion/chain', poaCpaInclusionChainRoutes);
app.route('/api/levy-assessment/chain', levyAssessmentChainRoutes);
app.route('/api/connection-energization/chain', connectionEnergizationChainRoutes);
app.route('/api/trade-allocation/chain', tradeAllocationChainRoutes);
app.route('/api/reserve-account/chain', reserveAccountChainRoutes);
app.route('/api/ppa-change-in-law/chain', ppaChangeInLawChainRoutes);
app.route('/api/generation-revenue-assurance/chain', generationRevenueAssuranceChainRoutes);
app.route('/api/service-contract/chain', serviceContractChainRoutes);
app.route('/api/ipp/change-order/chain', projectChangeOrderChainRoutes);
app.route('/api/carbon-issuance/chain', carbonIssuanceChainRoutes);
app.route('/api/consultation-notice/chain', consultationNoticeChainRoutes);
app.route('/api/black-start/chain', blackStartChainRoutes);
app.route('/api/settlement-fail/chain', settlementFailChainRoutes);
app.route('/api/dscr-monitoring/chain', dscrMonitoringChainRoutes);
app.route('/api/ppa-nomination/chain', ppaNominationChainRoutes);
app.route('/api/bess-soh/chain', bessSohChainRoutes);
app.route('/api/oem-fco/chain', oemFcoChainRoutes);
app.route('/api/benchmark-transition/chain', benchmarkTransitionChainRoutes);
app.route('/api/ccp-assessment/chain', ccpAssessmentChainRoutes);
app.route('/api/ipp/project-risk/chain', projectRiskChainRoutes);
app.route('/api/regulator/enforcement-action/chain', enforcementActionChainRoutes);
app.route('/api/grid/rez-capacity/chain', rezCapacityChainRoutes);
app.route('/api/lender/sll-kpi/chain', sllKpiChainRoutes);
app.route('/api/ipp/submittal-rfi/chain', submittalRfiChainRoutes);
app.route('/api/ipp/dfr/chain', dfrChainRoutes);
app.route('/api/ipp/punch-list/chain', punchListChainRoutes);
app.route('/api/ipp/itp/chain', itpChainRoutes);
app.route('/api/ipp/handover-dossier/chain', handoverDossierChainRoutes);
app.route('/api/offtaker/ppa-annual-recon/chain', ppaAnnualReconChainRoutes);
app.route('/api/esums/soiling-audit/chain', soilingAuditChainRoutes);
app.route('/api/carbon/esg-disclosure/chain', esgDisclosureChainRoutes);
app.route('/api/support/service-request/chain', serviceRequestChainRoutes);
app.route('/api/grid/imbalance-settlement/chain', imbalanceSettlementChainRoutes);
app.route('/api/regulator/enforcement-action-s35/chain', enforcementActionS35ChainRoutes);
app.route('/api/trader/pretrade-credit/chain', pretradeCreditChainRoutes);
app.route('/api/lender/loan-restructure/chain', loanRestructureChainRoutes);
app.route('/api/carbon/credit-rating/chain', carbonCreditRatingChainRoutes);
app.route('/api/grid/transmission-outage/chain', transmissionOutageChainRoutes);
app.route('/api/trader/pnl-attribution/chain', pnlAttributionChainRoutes);
app.route('/api/ipp/wbs-schedule/chain', ippScheduleChainRoutes);
app.route('/api/ipp/cost-evm/chain', ippEvmChainRoutes);
app.route('/api/ipp/document-control/chain', ippDocumentControlChainRoutes);
app.route('/api/ipp/submittals/chain', ippSubmittalRoute);
app.route('/api/ipp/rfis/chain', ippRfiRoute);
app.route('/api/ipp/change-orders/chain', ippChangeOrderRoute);
// Wave 118 - Hash-Chain Audit Trees & Tamper-Evident Ledger. Phase-B opener.
// Platform-wide audit chain (NOT an IPP chain). Sister of cascade.ts.
// Public /verify/:block_height endpoint requires no auth.
app.route('/api/audit-chain', auditChainRoute);
// Wave 119 - Certified Regulator Export Packs. Phase-B wave 2 of 4.
// 12-state chain producing XBRL+iXBRL+ESG-narrative packs lodged via mTLS
// to NERSA/IPPO/SARB/DMRE/FSCA/DFFE/DTI/JSE/SARS/CIPC. Joins W118 audit
// namespace; public POST /lodge/:target requires no auth (mTLS handshake
// is gated inside the route via cf-client-cert-sha256).
app.route('/api/regulator-exports', regulatorExportRoutes);
// Wave 120 - Reconciliation Attestation. Phase-B wave 3 of 4. L5 ICFR
// attestation chain reconciling every cross-chain row + external-system
// feed (SAP S/4HANA, Oracle, SAGE 300, Workday, STRATE, SWIFT MT940,
// NERSA/IPPO/DMRE inboxes, bank statements, W118 published blocks)
// against W118 audit-chain spine. 12-state + 4-branch chain with INVERTED
// SLA HOURS (daily 24h / weekly 96h / monthly 168h / quarterly 360h /
// annual 720h). SIGNATURE: escalate_to_audit_committee EVERY tier.
// WRITE {admin only}; READ all 9 personas; external-auditor read via
// signed JWT on /external/:id (NOT mTLS like W119).
app.route('/api/reconciliation-attestation', reconciliationAttestationRoutes);
// Wave 121 - Control-Environment Audit. FOURTH and FINAL Phase-B wave.
// Closes Phase B (W118 spine + W119 exports + W120 attestation + W121
// control-environment audit). Per-control evidence dossiers (Design /
// ToD / ToOE / deficiency / remediation) closing SOC 2 Type II + COSO
// 2013 ICIF + ISO 27001:2022 ISMS certification. 12-state + 4-branch
// chain with INVERTED SLA HOURS (preventive 168h / detective 240h /
// corrective 360h / directive 480h / governance 720h). SIGNATURE:
// flag_deficient EVERY tier WHEN material_weakness_suspected
// (MATERIAL-WEAKNESS-DEFICIENT hard line). accept_with_exception
// directive+governance only. archive EVERY tier WHEN external_auditor_
// sign_off. sla_breached directive+governance only. WRITE {admin
// only}; READ all 9 personas; external-auditor read via signed JWT on
// /external/:id (same pattern as W120).
app.route('/api/control-environment-audit', controlEnvironmentAuditRoutes);
// W122 SCADA / IEC 61850 substation connector — Phase C opener.
// External-system real-time protocol bridge: IEC 61850 MMS/GOOSE/SV +
// 60870-5-104 + DNP3 + Modbus + IEEE C37.118 + OPC UA. mTLS-gated
// PUBLIC peer endpoint mounted BEFORE authMiddleware inside the route
// module — peer counterparties read via /api/scada-connector/peer/:peer_id
// with cf-client-cert-sha256 header. 12-state forward + 4 branch
// machine; INVERTED SLA hours (pilot 168 .. national 720); FLOOR-AT-
// LARGE >=1 / FLOOR-AT-NATIONAL >=3 of 5 flags. SIGNATURE: revoke EVERY
// tier (NERSA + SARB BA 700 + SOC). WRITE {admin, grid_operator,
// ipp_developer}. READ all 9 personas. 5 bridges (W118 mandatory).
app.route('/api/scada-connector', scadaConnectorRoutes);
// W123 MQTT / OPC-UA Edge-Device IIoT Connector — Phase C wave 2 of 5.
// Sister of W122 (substation-grade) - this is the EDGE-DEVICE / IIoT
// BROKER tier: MQTT v5/MQTT-SN + OPC UA 1.05/Pub-Sub + Sparkplug B +
// IEC 61400-25 + IEEE 2030.5 (CSIP) + SunSpec Modbus. mTLS-gated PUBLIC
// peer endpoint at /api/mqtt-opcua-connector/peer/:peer_id mounted
// BEFORE authMiddleware inside the route module - uses
// x-mtls-cert-fingerprint header (Phase-C consistency with W122).
// 11-state forward + 4 branch machine; INVERTED SLA hours (edge 168
// .. national_iot_backbone 720); FLOOR-AT-LARGE-FLEET >=1 / FLOOR-AT-
// NATIONAL-IOT-BACKBONE >=3 of 5 flags. SIGNATURE: revoke_credential
// EVERY tier (NERSA C-3 + IEC 62443 + POPIA s19 + SARB BA 700).
// WRITE {admin, grid_operator, ipp_developer, support}. READ all 9
// personas + external iot_peer via mTLS. 5 bridges (W118 mandatory).
app.route('/api/mqtt-opcua-connector', mqttOpcuaConnectorRoutes);
// W124 STRATE / SWIFT Settlement Connector - Phase C wave 3 of 5.
// MONEY-IN/MONEY-OUT financial settlement spine: STRATE (SA CSD T+3/T+1)
// + SWIFT MT/MX (pacs/camt/pain ISO 20022) + SARB SAMOS RTGS + SADC RTGS
// + commercial bank EFT/ACH. mTLS-gated PUBLIC peer endpoint at
// /api/strate-swift-connector/peer/:peer_id mounted BEFORE authMiddleware
// inside the route module - uses x-mtls-cert-fingerprint header
// (Phase-C consistency with W122/W123). 12-state forward + 4 branch
// machine; INVERTED SLA hours (domestic_eft 168 .. swift_global 720).
// FLOOR-AT-SAMOS-RTGS >=1 / FLOOR-AT-SWIFT-GLOBAL >=3 of 5 flags.
// SIGNATURE: revoke_credential EVERY tier (SARB ExCon + FIC Act +
// Basel III + CPMI-IOSCO PFMI Principle 9). WRITE {admin, trader,
// lender, offtaker}. READ all 9 personas + external bank_peer via
// mTLS. 5 bridges (W120+W118 mandatory). NEW 'settlement' namespace.
app.route('/api/strate-swift-connector', strateSwiftConnectorRoutes);
// W125 SAP / Oracle ERP Connector - Phase C wave 4 of 5. ENTERPRISE
// BACK-OFFICE financial integration spine: SAP S/4HANA Cloud + SAP ECC
// (IDoc FIDCC1/FIDCC2/REMADV) + Oracle EBS + Oracle Fusion + Workday +
// SAGE 300 + Dynamics 365 + NetSuite + Epicor + IFS. mTLS-gated PUBLIC
// peer endpoint at /api/sap-oracle-erp-connector/peer/:peer_id mounted
// BEFORE authMiddleware inside the route module - uses
// x-mtls-cert-fingerprint header (Phase-C consistency). 10-state forward
// + 4 branch machine; INVERTED SLA hours (single_module 168 ..
// multi_country 720). FLOOR-AT-ENTERPRISE-WIDE >=1 / FLOOR-AT-MULTI-
// COUNTRY >=3 of 5 flags. SIGNATURE: revoke_credential EVERY tier
// (SARS + CIPC + SOC 1 Type II + ISO 27001 + PCAOB AS 5). WRITE
// {admin, trader, lender, offtaker}. READ all 9 personas + external
// erp_counterparty via mTLS. 5 bridges (W118 mandatory). Shares
// 'settlement' audit namespace with W124.
app.route('/api/sap-oracle-erp-connector', sapOracleErpConnectorRoutes);
// W126 CIPC / SARS / NERSA Government Filing APIs Connector - Phase C
// wave 5 of 5 - FINAL Phase-C connector wave. Closes Phase C. SA
// GOVERNMENT REGULATOR filing spine: CIPC Annual Returns + SARS e-Filing
// (IT14, VAT201, EMP201, IRP5) + NERSA quarterly electricity/gas returns
// + DMRE REIPPPP + DFFE GHG + PAIA disclosure. mTLS-gated PUBLIC peer
// endpoint at /api/government-filing-connector/peer/:peer_id mounted
// BEFORE authMiddleware inside the route module - uses
// x-mtls-cert-fingerprint header (Phase-C consistency). 10-state forward
// + 4 branch machine; INVERTED SLA hours (single_filing 168 ..
// systemic_critical 720). FLOOR-AT-MULTI-JURISDICTION >=1 / FLOOR-AT-
// SYSTEMIC-CRITICAL >=3 of 5 flags. SIGNATURE: revoke_credential EVERY
// tier (Companies Act + Tax Admin Act + ERA s.10 + PAIA s.18). WRITE
// {admin, regulator, trader, lender, offtaker} - 5 writers (key diff
// from W125's 4-writer pattern). READ all 9 personas + external
// gov_authority_peer via mTLS. 5 bridges (W125 ERP, W124 settlement,
// W74 NERSA levy, W48 carbon tax, W118 audit). Opens NEW 'regulator'
// audit namespace.
app.route('/api/government-filing-connector', governmentFilingConnectorRoutes);
// W127 — Anomaly-Detection ML Model — FIRST wave of Phase D (ML brain
// replacing the W71 heuristic ensemble). 12-state P6 chain on
// oe_anomaly_detection_ml: model_proposed → dataset_bound →
// features_engineered → train_test_split → model_trained →
// backtest_validated → calibrated → shadow_deployed → live_ab_active →
// champion_promoted → retrained → archived (HARD). 4 branch states
// (drift_detected soft / rolled_back terminal / recalled terminal /
// failover_to_baseline soft). INVERTED SLA at model_proposed (single
// asset 24h → fleet_systemic 720h). 5 FLOOR flags (safety_critical_
// inference / regulator_reportable_drift / nerc_cip_audit_in_scope /
// sox_ml_governance_required / iso_42001_ai_management_required) lift
// to large_fleet ≥1 / fleet_systemic ≥3. SIGNATURE: rollback_model
// crosses regulator EVERY tier (W127-ML-ROLLBACK FIRST Phase-D hard
// line) — ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2
// Type II + NERC CIP-013 alignment. WRITE {admin, support} - 2
// writers. READ all 9 personas. INTERNAL ML governance chain (no
// mTLS, no public peer endpoint). 5 bridges (W71 asset prognostics
// MANDATORY, W12 site commissioning, W118 audit MANDATORY, W126
// regulator filing when regulator_reportable_drift, W74 NERSA levy
// when iso_42001). Opens NEW 'ml' audit namespace (4th after
// platform/grid/settlement/regulator).
app.route('/api/anomaly-detection-ml', anomalyDetectionMlRoutes);
// W128 RUL Prediction ML Model lifecycle - PHASE D WAVE 2 OF 4.
// Survival/Cox PH ML models REPLACING the W71 OLS-style degradation
// slope. Sister of W127 (anomaly ML). 12-state P6 + 4 branch states
// (drift / rollback / recall / failover_to_ols). SIGNATURE
// W128-RUL-ROLLBACK: rollback_model crosses regulator EVERY tier
// (SECOND Phase-D hard line). W128-UNIQUE: promote_champion crosses
// at fleet_systemic WHEN iso_42001 (replacing OLS at systemic scale
// is itself a governance event). INVERTED SLA (LARGER fleet=MORE
// time). 5 bridges: W71 NOT NULL (OLS baseline) + W21 lender +
// W77 reserve + W63 warranty + W118 audit. WRITE {admin, support}.
// READ all 9 personas. JOINS W127 'ml' audit namespace.
app.route('/api/rul-prediction-ml', rulPredictionMlRoutes);
// W129 Fault-Fingerprint Multi-Class ML chain - PHASE D WAVE 3 OF 4.
// Multi-class fault classifier (XGBoost/RandomForest/GradientBoosting/
// CNN-1D/LightGBM/CatBoost/baseline_physics) REPLACING the W71 12-mode
// physics-rule fault fingerprinting. THIRD Phase-D wave, joining W127
// (anomaly) + W128 (RUL survival) in the 'ml' audit namespace.
// SIGNATURE W129-FFML-ROLLBACK: rollback_model crosses regulator EVERY
// tier (THIRD Phase-D hard line, joins W127+W128). W129-UNIQUE:
// add_novel_class crosses at fleet_systemic only (adding a previously-
// unseen fault mode at fleet-wide scale is EU-AI-Act-reportable model-
// scope expansion). INVERTED SLA (LARGER fleet=MORE time, longer than
// W128 - multi-class confusion-matrix stabilisation + per-class
// calibration need more shadow time on imbalanced classes). 5 bridges:
// W71 NOT NULL (12-mode physics baseline reconciliation MANDATORY) +
// W15 warranty claim + W41 ITIL problem mgmt + W63 warranty recovery +
// W118 audit. WRITE {admin, support}. READ all 9 personas.
app.route('/api/fault-fingerprint-ml', faultFingerprintMlRoutes);
// W130 - NTT Comparison Battery (PHASE D WAVE 4 OF 4 - CLOSES PHASE D).
// Aggregator chain stitching W127 anomaly + W128 RUL + W129 fault vs
// emulated NTT IoT/O&M baseline. Each row = one comparison cycle
// (nightly default). Esums dashboard reads /dashboard/hero for the live
// "savings vs NTT-30%" KPI. WRITE {admin, support}. READ all 9 personas.
// W118 audit bridge MANDATORY at publish_audit (422 reject otherwise).
app.route('/api/ntt-comparison-battery', nttComparisonBatteryRoutes);
// W131 Stage Gates (DG0-DG4) — PHASE E WAVE 1 OF N.
// PMBOK 7 / Primavera P6 / Equator Principles project-governance gate chain.
// 12-state P6 on oe_stage_gates. SIGNATURE: reject_gate EVERY tier
// (project termination universally reportable to NERSA + DMRE).
// WRITE {admin, ipp_developer}. READ all 9 personas.
// JOINS existing 'ipp' audit namespace.
app.route('/api/stage-gate', stageGateRoutes);
// W132: IPP Issues Log — PMBOK 7 issue register.
// 12-state + 4 branch; URGENT SLA (P1=24h tightest); WRITE {admin, ipp_developer}.
// SIGNATURE: escalate_to_regulator EVERY tier when safety OR regulatory.
app.route('/api/ipp-issues', ippIssuesRoutes);
// W133: IPP Risk Register & Treatment Chain — PMBOK 7 + ISO 31000 + IEC 31010.
// 11-state + 4 branch; INVERTED SLA (catastrophic 2160h most time); WRITE {admin, ipp_developer}.
// SIGNATURE: escalate_risk EVERY tier when safety AND (critical|catastrophic).
app.route('/api/ipp-risk', ippRiskRoutes);
// W134: IPP Stakeholder Register & Engagement Tracking — PMBOK 7 S13 + ISO 21500 + REIPPPP S4 + IFC PS1.
// 12-state engagement lifecycle; URGENT SLA (strategic_ally 24h tightest); WRITE {admin, ipp_developer}.
// SIGNATURE: escalate_engagement EVERY tier; flag_resistant crosses when power_score >= 4.
app.route('/api/ipp-stakeholder', ippStakeholderRoutes);
// W135 IPP Lessons Learned Register — PMBOK 7 / ISO 21502:2022 §12.6.
// 13-state P6; INVERTED SLA (critical_impact 720h MOST time); WRITE {admin, ipp_developer}.
// SIGNATURE: disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1.
app.route('/api/ipp-lessons-learned', ippLessonsLearnedRoutes);
// W136 IPP NCR Management — ISO 9001:2015 §8.7 + Equator Principles IV + REIPPPP QA.
// 12-state P6; URGENT SLA (safety_critical 24h tightest → cosmetic 720h); WRITE {admin, ipp_developer, support}.
// SIGNATURE: reject_escalate EVERY tier; accept_as_is crosses when floor_ie_notification_required OR floor_nersa_reportable.
app.route('/api/ipp-ncr', ippNcrRoutes);
// W137 IPP Method Statement (SWMS) Management — OHSA Const.Reg.7 + EP4 + REIPPPP site safety.
// 12-state P6; URGENT SLA (high_risk 24h tightest → routine 336h); WRITE {admin, ipp_developer, support}.
// SIGNATURE: approve_ms EVERY tier on critical_lift/confined_space/live_electrical; suspend_work crosses on floor_regulatory_notification.
app.route('/api/ipp-method-statement', ippMethodStatementRoutes);
// W138 IPP Environmental Monitoring Log — NEMA s30 + DFFE EIA conditions + ISO 14001:2015.
// 12-state P6; URGENT SLA (critical 24h tightest → baseline 720h); WRITE {admin, ipp_developer, support}.
// SIGNATURE: flag_exceedance EVERY tier on near_sensitive_receptor/eia_condition_breach/nema_s30_notification;
// submit_report crosses when floor_dffe_report_required.
app.route('/api/ipp-env-monitoring', ippEnvMonitoringRoutes);
// W139 IPP Material Inspection Record — ISO 9001:2015 §8.6 + REIPPPP + Equator Principles EP4.
// 12-state P6; URGENT SLA (critical_structural 24h tightest → general 168h); WRITE {admin, ipp_developer, support}.
// SIGNATURE: reject_material EVERY tier when IE witnessed; quarantine_material when floor_critical_safety.
app.route('/api/ipp-mir', ippMirRoutes);
// W140 IPP Subcontractor Management — OHSA Construction Regs 2014 Reg.6 + ISO 45001:2018 + REIPPPP ED + EP4.
// 12-state P6; URGENT SLA (critical_trade 24h tightest → labor_only 168h); WRITE {admin, ipp_developer, support}.
// SIGNATURE: terminate_subcontractor EVERY tier on safety_violation; suspend when floor_ohsa_notification;
// close_subcontract when floor_lender_escrow_release. Beats Oracle Aconex + Procore Subcontractors.
app.route('/api/ipp-subcontractor', ippSubcontractorRoutes);
// W141 — IPP Progress Claims & Payment Certificates (JBCC + NEC4 + REIPPPP milestones + EP4).
// INVERTED SLA: major 720h / minor 72h. SIGNATURE: certify_by_engineer EVERY tier on IE milestone;
// record_final_account EVERY tier; approve_payment when lender_cert_required.
// Beats Oracle Aconex (payment-as-document) with full P6 lifecycle.
app.route('/api/ipp-progress-claim', ippProgressClaimRoutes);
// W142 — IPP Technical Query (TQ) Log (ISO 9001 + FIDIC EPC + CIDB).
// URGENT SLA: safety_critical 24h / construction_blocking 48h / standard 168h / information_only 336h.
// SIGNATURE: flag_design_change EVERY tier on structural safety; escalate_tq crosses on IE notification.
// Beats Aconex (static document workflow) with full designer-response P6 lifecycle.
app.route('/api/ipp-tq', ippTqRoutes);
// W143 — IPP Daily Construction Diary (JBCC 6.2 cl.8.13 + NEC4 cl.25 + OHSA Const.Regs 2014).
// URGENT SLA: critical_delay 12h | daily_operational 24h | shutdown_partial 48h | no_work 96h.
// SIGNATURE: miss_diary EVERY tier; dispute_diary on delay+critical_delay; submit_diary on safety_incident.
app.route('/api/ipp-diary', ippDiaryRoutes);
// W144 Site/Engineer's Instructions — JBCC cl.18 + NEC4 PMI + OHSA s.8
// SIGNATURE: issue_instruction when safety_directive EVERY tier; dispute_instruction when variation+value>250k
app.route('/api/ipp-site-instruction', ippSiteInstructionRoutes);
// W145 DLP Defects Register — JBCC Cl.19/32 + NEC4 Cl.43 + REIPPPP QMP
// SIGNATURE: ie_reject → escalated_to_ncr EVERY tier; notify_defect crosses when safety/structural
app.route('/api/ipp-dlp-defect', ippDlpDefectRoutes);
// W146: JBCC Cl.38-39 / NEC4 Cl.60-62; INVERTED SLA; refer_adjudication crosses EVERY tier
app.route('/api/ipp-variation-order', ippVariationOrderRoutes);
// W147: JBCC Cl.40-43 / NEC4 Cl.51; INVERTED SLA; refer_adjudication + certify_final cross
app.route('/api/ipp-payment-cert', ippPaymentCertRoutes);
// W148: JBCC Cl.27-29 / NEC4 Cl.53-54; INVERTED SLA; issue_fcc crosses EVERY tier
app.route('/api/ipp-final-completion', ippFinalCompletionRoutes);
// W149: OHSA §8 + IEC 62446-1; INVERTED SLA; accept_handover crosses EVERY tier
app.route('/api/ipp-om-handover', ippOmHandoverRoutes);
// W150: Deeds Act 47/1937 + SPLUMA; INVERTED SLA; lodge_deeds crosses EVERY tier
app.route('/api/ipp-land-register', ippLandRegisterRoutes);
// W151: NEMA 107/1998 §24G + EIA Regs 2014; INVERTED SLA; issue_closure_cert crosses EVERY tier
app.route('/api/ipp-env-closure', ippEnvClosureRoutes);
// W152: IEC 61724-1 + NERSA Grid Code §C-5; PAC/FAC; INVERTED SLA; issue_performance_cert crosses EVERY tier
app.route('/api/ipp-commissioning-test', ippCommissioningTestRoutes);
// W153: REIPPPP Schedule 5 + LMA IE role; INVERTED SLA; issue_cert crosses EVERY tier
app.route('/api/ipp-ie-cert', ippIeCertRoutes);
// W154: ERA §22 + Grid Code §C-2; INVERTED SLA; sign_tpa_agreement crosses EVERY tier
app.route('/api/ipp-tpa', ippTpaRoutes);
// W155: ERA §35 PPA variation; INVERTED SLA; approve_variation crosses EVERY tier
app.route('/api/ipp-ppa-variation', ippPpaVariationRoutes);
// W156: ERA §11 change of control; INVERTED SLA; grant_approval crosses EVERY tier
app.route('/api/ipp-change-of-control', ippChangeOfControlRoutes);
// W157: SARB ExCon + NERSA §35 refinancing; INVERTED SLA; achieve_financial_close crosses EVERY tier
app.route('/api/ipp-refinancing', ippRefinancingRoutes);
// W158: REIPPPP Schedule 6 + ERA §35 + FIDIC 19 force majeure; URGENT SLA; grant_relief + declare_prolonged cross EVERY tier
app.route('/api/ipp-fm', ippFmRoutes);
app.route('/api/ipp-annual-report', ippAnnualReportRoutes);
app.route('/api/ipp-contractor-default', ippContractorDefaultRoutes);
app.route('/api/ipp-eco-report', ippEcoReportRoutes);
app.route('/api/ipp-lta-certificate', ippLtaCertificateRoutes);
app.route('/api/ipp-land-amendment', ippLandAmendmentRoutes);
app.route('/api/ipp-community-trust', ippCommunityTrustRoutes);
app.route('/api/ipp-grid-compliance', ippGridComplianceRoutes);
app.route('/api/ipp-ccc', ippCccRoutes);
app.route('/api/ipp-om-contract', ippOmContractRoutes);
app.route('/api/ipp-bfs', ippBfsRoutes);
app.route('/api/ipp-ea-amendment', ippEaAmendmentRoutes);
app.route('/api/ipp-wul', ippWulRoutes);
app.route('/api/ipp-hra', ippHraRoutes);
app.route('/api/ipp-ael', ippAelRoutes);
app.route('/api/ipp-force-majeure', ippForceMajeureRoutes);
app.route('/api/ipp-lc-reports', ippLcReportRoutes);
app.route('/api/ipp-milestone-certs', ippMilestoneCertRoutes);
app.route('/api/ipp-esmr', ippEsmrRoutes);
app.route('/api/ipp-ie-annual-reviews', ippIeAnnualReviewRoutes);
app.route('/api/ipp-insurance-renewals', ippInsuranceRenewalRoutes);
app.route('/api/ipp-perf-securities', ippPerfSecurityRoutes);
app.route('/api/ipp-cep-compliance', ippCepComplianceRoutes);
app.route('/api/ipp-sed-compliance', ippSedComplianceRoutes);
app.route('/api/ipp-bbbee-verification', ippBbbeeVerificationRoutes);
app.route('/api/ipp-lender-reporting', ippLenderReportingRoutes);
app.route('/api/ipp-licence-returns', ippLicenceReturnsRoutes);
app.route('/api/ipp-reipppp-reports', ippReippppReportsRoutes);
app.route('/api/ipp-equity-transfer', ippEquityTransferRoutes);
app.route('/api/ipp-quarterly-gen-reports', ippQuarterlyGenReportRoutes);
app.route('/api/ipp-annual-compliance-assessments', ippAnnualComplianceAssessmentRoutes);
app.route('/api/ipp-annual-audits', ippAnnualAuditRoutes);
app.route('/api/ipp-emp-compliance-reports', ippEmpComplianceReportRoutes);
app.route('/api/ipp-cp-tracker', ippCpTrackerRoutes);
app.route('/api/ipp-licence-obligations', ippLicenceObligationRoutes);
app.route('/api/facility-amendments', facilityAmendmentRoutes);
app.route('/api/esap-compliance', esapComplianceRoutes);
app.route('/api/protection-relay-tests', protectionRelayRoutes);
app.route('/api/unserved-energy-claims', unservedEnergyRoutes);
app.route('/api/station-participant-links', stationParticipantLinkRoutes);
app.route('/api/admin-platform', adminPlatformRoutes);
app.route('/api/settlement-auto', settlementAutoRoutes);
app.route('/api/imbalance', imbalanceRoutes);
app.route('/api/data-tier', dataTierRoutes);
app.route('/api/ai-briefs', aiBriefsRoutes);
app.route('/api/realtime', realtimeRoutes);
app.route('/api/siem', siemRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/telemetry', telemetryRoutes);
app.route('/api/admin/monitoring', monitoringRoutes);
app.route('/api/admin/revenue', adminRevenueRoutes);
// Backup routes are deliberately mounted outside /api/admin to avoid being
// shadowed by the admin sub-app's global authMiddleware — Hono flattens
// sub-app middleware onto the shared router, so /api/admin/* middleware
// would fire before the backup-specific X-Backup-Token guard ever runs,
// which would break the unattended GitHub Actions cron job.
app.route('/api/backup', backupRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/schedule', scheduleRoutes);
// Public portal MUST live on a sibling prefix outside the auth-protected
// esums routes — and the public view + admin token endpoints are split
// into two routers so they can have independent middleware chains.
app.route('/api/esums-portal-view', esumsOmPortalPublic);
app.route('/api/esums-portal', esumsOmPortalAdmin);
// Native device ingestion (per-site opaque ingest keys, NO user JWT).
// MUST be sibling to /api/esums so authMiddleware doesn't intercept.
app.route('/api/esums-ingest', esumsIngestRoutes);
app.route('/api/esums', esumsOmRoutes);
app.route('/api/esums', esumsOmIntelRoutes);
app.route('/api/esums', esumsOmAnalysisRoutes);
app.route('/api/esums/data-sources', esumsDataSourcesRoutes);
app.route('/api/esums/projects', esumsProjectsRoutes);
app.route('/api/esums/solax', esumsOmSolaxRoutes);
app.route('/api/esums/manufacturers', esumsManufacturersRoutes);
app.route('/api/esums/accruals', esumsAccrualsRoutes);
app.route('/api/esums/settlement-invoices', esumsInvoiceRoutes);
app.route('/api/esums/carbon-credits', esumsCreditRoutes);
// Public status page MUST be mounted BEFORE the catch-all platform router.
// platformFeaturesRoutes is mounted at /api and applies authMiddleware to
// every request that passes through it, including those that don't match
// a route inside the sub-app — so order matters here.
app.route('/api/public/status', publicStatusRoutes);
app.route('/api/public/status', statusDeepPub);
app.route('/api/public/regulator', regulatorL5Pub);
app.route('/api/public/audit',     auditL5Pub);
app.route('/api/public/legal',     publicLegalRoutes);
// Must be BEFORE /api (platformFeaturesRoutes) which has a blanket authMiddleware
// that would intercept these routes before they reach their own per-path guards.
app.route('/api/pdf',  pdfRoutes);
app.route('/api/rbac', rbacRoutes);
app.route('/api/mfa',         mfaRoutes);
app.route('/api/kyc',         kycRoutes);
app.route('/api/consent',     consentRoutes);
app.route('/api/popia',       popiaSelfServiceRoutes);
app.route('/api/regulator',   regulatorReportRoutes);
// Depth additions — L4/L5 backends for the L2/L3 surfaces above
// (statusDeepPub already mounted earlier, before the /api catch-all)
app.route('/api/auth-deep',     authDeepRoutes);
app.route('/api/kyc-deep',      kycDeepRoutes);
app.route('/api/status-admin',  statusDeepAdmin);
app.route('/api/popia-deep',    popiaDeepRoutes);
app.route('/api/reports-deep',  reportsDeepRoutes);
app.route('/api/trading-deep',    tradingDeepRoutes);
app.route('/api/settlement-deep', settlementDeepRoutes);
app.route('/api/ipp-deep',        ippDeepRoutes);
app.route('/api/lender-deep',     lenderDeepRoutes);
app.route('/api/carbon-deep',     carbonDeepRoutes);
app.route('/api/grid-l5',         gridL5Routes);
app.route('/api/regulator-l5',    regulatorL5Admin);
app.route('/api/trading-clearing-l5', tradingClearingL5Routes);
app.route('/api/audit-l5',            auditL5Admin);
app.route('/api/marketplace-l5',      marketplaceL5Routes);
app.route('/api/ai-assistant',        aiAssistantRoutes);
app.route('/api/polish',              polishRoutes);
app.route('/api/business-depth',      businessDepthRoutes);
app.route('/api/bulk',                bulkOpsRoutes);
app.route('/api/ux-state',            uxStateRoutes);
app.route('/api/documents',           documentsRoutes);
app.route('/api/print-packs',         printPacksRoutes);
app.route('/api/onboarding', onboardingRoutes);
app.route('/api/kyc-verifications', kycChainRoutes);
app.route('/api/smart-meter-assets', smartMeterChainRoutes);
app.route('/api/carbon-tax-returns', carbonTaxChainRoutes);
app.route('/api/fsca-compliance-reports', fsccChainRoutes);
app.route('/api/green-bond-reports', greenBondChainRoutes);
app.route('/api/capital-adequacy-reports', capAdequacyChainRoutes);
app.route('/api/slb-kpi-ratchets', slbKpiChainRoutes);
app.route('/api/demand-response-events', demandResponseChainRoutes);
app.route('/api/carbon-registry-transfers', carbonRegistryTransferChainRoutes);
app.route('/api/milestone-variance-reports', milestoneVarianceChainRoutes);
app.route('/api/csat-records', csatChainRoutes);
app.route('/api/public-consultations', publicConsultationChainRoutes);
app.route('/api/green-tariff-disclosures', greenTariffChainRoutes);
app.route('/api/substation-assets', substationAssetChainRoutes);
app.route('/api/dscr-reports', dscrReportChainRoutes);
app.route('/api/methodology-amendments', methodologyAmendmentChainRoutes);
app.route('/api/esap-monitoring', esapMonitoringChainRoutes);
app.route('/api/eop-activations', eopActivationChainRoutes);
app.route('/api/fsca-conduct-reports', fscaConductReportChainRoutes);
app.route('/api/sla-performance-reports', slaPerformanceReportChainRoutes);
app.route('/api/credit-insurance', creditInsuranceChainRoutes);
app.route('/api/wheeling-access', wheelingAccessChainRoutes);
app.route('/api/market-conduct-exams', marketConductExamChainRoutes);
app.route('/api/export-curtailments', exportCurtailmentChainRoutes);
app.route('/api/cross-border-trades', crossBorderTradeChainRoutes);
app.route('/api/cp-clearances', cpClearanceChainRoutes);
app.route('/api/gtia', gtiaChainRoutes);
app.route('/api/carbon/scope3-disclosure/chain', scope3DisclosureChainRoutes);
app.route('/api/carbon/vcm-projects', vcmProjectDevelopmentChainRoutes);
app.route('/api/carbon/budget', carbonBudgetChainRoutes);
app.route('/api/rec/device-registration', recDeviceRegistrationChainRoutes);
app.route('/api/rec/issuance', recIssuanceChainRoutes);
app.route('/api/vcm/order-book', vcmOrderBookRoutes);
app.route('/api/sustainability/marketplace', sustainabilityMarketplaceRoutes);
app.route('/api/sustainability/transactions', sustainabilityTransactionChainRoutes);
app.route('/api/certificate-track/bundle', certBundleChainRoutes);
// platformFeaturesRoutes is the catch-all for /api — it must remain LAST
// so all specific /api/* mounts above are tried first.
app.route('/api', platformFeaturesRoutes);

// Admin-only "run cron once" endpoint — invokes the same runCron() that the
// Workers scheduler fires, but on demand so operators (and the smoke-cron
// script) can verify each schedule completes without 500s.
//
//   POST /api/admin/cron/run-once?pattern=*/15+*+*+*+*
//
// Returns { success: true, ran: <pattern> } if runCron completes; surfaces
// the first error otherwise. Auth: admin-only.
{
  const cron = new Hono<HonoEnv>();
  cron.use('*', authMiddleware);
  cron.post('/run-once', async (c) => {
    const user = getCurrentUser(c);
    if (user.role !== 'admin') {
      return c.json({ success: false, error: 'admin only' }, 403);
    }
    const pattern = c.req.query('pattern');
    if (!pattern) return c.json({ success: false, error: 'pattern query param required' }, 400);
    try {
      await runCron(c.env, pattern);
      return c.json({ success: true, ran: pattern });
    } catch (err) {
      return c.json({
        success: false,
        error: 'cron failed',
        detail: null,
      }, 500);
    }
  });
  app.route('/api/admin/cron', cron);
}

// Static assets (SPA shell, JS, CSS, images) are served by Cloudflare Pages directly.
// This Worker / Pages Function only handles API routes under /api/*.

// Error handling — emit a structured log + persist to error_log so the
// /admin/monitoring console can surface the crash to operators. Response
// includes req_id so users / support can correlate back to the log line.
app.onError((err, c) => {
  const reqId = (c.get('requestId') as string | undefined) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const auth = c.get('auth') as { user?: { id?: string }; tenant_id?: string } | undefined;

  // AppError carries an intended statusCode — surface it instead of a
  // blanket 500. Auth failures stay 401, forbidden stays 403, validation
  // stays 400, etc. Only genuine unhandled errors (plain Error) collapse
  // to 500. We still write to error_log for ALL non-2xx for observability.
  const appErr = err instanceof AppError ? err : null;
  const status = appErr?.statusCode ?? 500;
  const outgoingBody: Record<string, unknown> = appErr
    ? { error: appErr.code, message: appErr.message, req_id: reqId }
    : { error: 'Internal Server Error', message: 'An unexpected error occurred', req_id: reqId };

  // Only log unexpected errors at error-level; log AppError at warn-level
  // so the alerting pipeline doesn't page operators for a user typo.
  const severity = appErr && status < 500 ? 'warn' : 'error';
  if (severity === 'error') {
    logger.error('unhandled_error', {
      req_id: reqId,
      route: c.req.path,
      method: c.req.method,
      participant_id: auth?.user?.id,
      tenant_id: auth?.tenant_id,
      error_name: (err as Error).name,
      error_message: err.message,
      error_stack: (err as Error).stack,
    });
  } else {
    logger.warn('handled_error', {
      req_id: reqId,
      route: c.req.path,
      method: c.req.method,
      status,
      code: appErr!.code,
      participant_id: auth?.user?.id,
    });
  }

  // Best-effort DB write only for 5xx — never mask the original error and
  // don't flood error_log with expected 401/403/404 from bots.
  if (status >= 500) try {
    const id = `errlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const write = c.env.DB.prepare(
      `INSERT INTO error_log
         (id, req_id, source, severity, route, method, status,
          participant_id, tenant_id, error_name, error_message,
          error_stack, user_agent, ip, url)
       VALUES (?, ?, 'server', 'error', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        reqId,
        c.req.path,
        c.req.method,
        status,
        auth?.user?.id || null,
        auth?.tenant_id || null,
        (err as Error).name || null,
        (err.message || '').slice(0, 2000),
        ((err as Error).stack || '').slice(0, 8000),
        (c.req.header('User-Agent') || '').slice(0, 500) || null,
        c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null,
        c.req.url.slice(0, 1000),
      )
      .run();
    c.executionCtx?.waitUntil?.(Promise.resolve(write).catch(() => {}));
  } catch {
    /* swallow — never fail the error handler */
  }

  return c.json(outgoingBody, status as 401 | 403 | 404 | 409 | 400 | 500);
});

// Not-found: if the request is for /api/* we return JSON 404; otherwise we
// fall through to the ASSETS binding so the SPA handles client-side routing.
app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ success: false, error: 'Not Found', path: c.req.path }, 404);
  }
  const assets = (c.env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
  if (assets) return assets.fetch(c.req.raw);
  return c.text('Not Found', 404);
});

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled handler — dispatched by Cloudflare Cron Triggers (wrangler.toml).
// Each cron fires a small maintenance job using the same D1/KV/R2 bindings.
// Errors are swallowed per-job so one failing job doesn't block the others.
// ═══════════════════════════════════════════════════════════════════════════

import { runSurveillanceScan } from './routes/regulator-suite';
import { executeSettlementRun } from './routes/settlement-automation';
import { executeSettlementRun as executeImbalanceRun } from './routes/imbalance';
import { verifyChain } from './utils/audit-chain';
import { runTradingSurveillanceScan } from './routes/trading-clearing-l5';
import { buildDailyMerkleRoots } from './routes/audit-l5';
import { runTelemetryRollupAndPurge } from './utils/telemetry-retention';
import { rollupMetrics } from './utils/metrics-rollup';

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error('cron_job_failed', {
      label,
      error_name: (err as Error).name,
      error_message: (err as Error).message,
    });
    return null;
  }
}

async function runCron(env: HonoEnv['Bindings'], pattern: string): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  switch (pattern) {
    case '*/15 * * * *':
      await safe('surveillance_scan', () => runSurveillanceScan(env));
      await safe('trading_surveillance_scan', () => runTradingSurveillanceScan(env));
      await safe('siem_dispatch', () => dispatchAllForwarders(env));
      // Wave 13 — Grid dispatch nomination SLA breach sweep. Walks all
      // non-terminal nominations with a next_sla_due_at set, marks
      // last_sla_breach_at, writes a sla_breached audit-chain event, and fires
      // dispatch.sla_breached cascade (regulator inbox high). 15-min cadence
      // matches the tightest SLA (nominated → 15m).
      await safe('dispatch_nomination_sla_sweep', async () => {
        const result = await dispatchNominationSlaSweep(env as never);
        console.log('dispatch_nomination_sla_sweep', JSON.stringify(result));
      });
      // Wave 14 — Support ticket SLA breach sweep. Walks open/triaged/in_progress
      // tickets with next_sla_due_at set, bumps sla_breach_count, writes the
      // audit row, and fires support.ticket_sla_breached cascade (regulator-
      // inbox crossing for P1 or compliance category). 15-min cadence matches
      // the tightest SLA (P1 triage → 60m, breach detectable within one tick).
      await safe('support_ticket_sla_sweep', async () => {
        const result = await supportTicketSlaSweep(env as never);
        console.log('support_ticket_sla_sweep', JSON.stringify(result));
      });
      // Wave 15 — Warranty claim SLA breach sweep. Walks open/triaged/submitted/
      // acknowledged/under_review/approved/disputed claims with SLA armed,
      // bumps breach count, audits, and fires warranty.claim_sla_breached
      // (safety severity crosses to regulator inbox).
      await safe('warranty_claim_sla_sweep', async () => {
        const result = await warrantyClaimSlaSweep(env as never);
        console.log('warranty_claim_sla_sweep', JSON.stringify(result));
      });
      // Wave 16 — Work order dispatch chain SLA sweep. Critical-priority
      // breaches cross into regulator inbox.
      await safe('wo_chain_sla_sweep', async () => {
        const result = await woChainSlaSweep(env as never);
        console.log('wo_chain_sla_sweep', JSON.stringify(result));
      });
      // Wave 17 — Carbon credit retirement chain SLA sweep. Article 6 and
      // compliance breaches cross into regulator inbox; voluntary is
      // operational only.
      await safe('carbon_retirement_sla_sweep', async () => {
        const result = await carbonRetirementSlaSweep(env as never);
        console.log('carbon_retirement_sla_sweep', JSON.stringify(result));
      });
      // Wave 18 — Planned outage submission chain SLA sweep. critical/high
      // breaches cross into regulator inbox per NERSA Grid Code §C-1.3.
      await safe('planned_outage_sla_sweep', async () => {
        const result = await plannedOutageSlaSweep(env as never);
        console.log('planned_outage_sla_sweep', JSON.stringify(result));
      });
      // Wave 19 — IPP procurement / RFP chain SLA sweep. high-tier breaches
      // cross into regulator inbox per REIPPPP transparency mandate.
      await safe('procurement_sla_sweep', async () => {
        const result = await procurementSlaSweep(env as never);
        console.log('procurement_sla_sweep', JSON.stringify(result));
      });
      // Wave 20 — IPP construction → COD certification chain SLA sweep.
      // Large-tier breaches cross into regulator inbox (NERSA grid-planning).
      await safe('cod_sla_sweep', async () => {
        const result = await codSlaSweep(env as never);
        console.log('cod_sla_sweep', JSON.stringify(result));
      });
      // Wave 21 — Lender drawdown / disbursement chain SLA sweep.
      // Senior-tier breaches cross into regulator inbox (SARB large-exposure).
      await safe('drawdown_sla_sweep', async () => {
        const result = await drawdownSlaSweep(env as never);
        console.log('drawdown_sla_sweep', JSON.stringify(result));
      });
      // Wave 22 — Offtaker PPA contract execution lifecycle SLA sweep + auto-expire.
      // Strategic-tier breaches cross into regulator inbox (NERSA Section 34).
      await safe('ppa_contract_sla_sweep', async () => {
        const result = await ppaContractSlaSweep(env as never);
        console.log('ppa_contract_sla_sweep', JSON.stringify(result));
      });
      // Wave 23 — Insurance claim chain SLA sweep.
      // Catastrophic-tier (≥R50m) breaches cross into regulator inbox (FSCA Section 38).
      await safe('insurance_claim_sla_sweep', async () => {
        const result = await insuranceClaimSlaSweep(env as never);
        console.log('insurance_claim_sla_sweep', JSON.stringify(result));
      });
      // Wave 24 — Esums PR sustained-underperformance chain SLA sweep.
      // Utility-tier breaches cross into regulator inbox.
      await safe('pr_sla_sweep', async () => {
        const result = await prSlaSweep(env as never);
        console.log('pr_sla_sweep', JSON.stringify(result));
      });
      // Wave 25 — HSE/SHEQ incident chain SLA sweep.
      // Reportable-tier (fatal/major/environmental) breaches cross to regulator inbox.
      await safe('hse_incident_sla_sweep', async () => {
        const result = await hseIncidentSlaSweep(env as never);
        console.log('hse_incident_sla_sweep', JSON.stringify(result));
      });
      // Wave 26 — Cybersecurity / POPIA s22 / Cybercrimes Act s54 SLA sweep.
      // Reportable-tier (catastrophic/major/personal_data) breaches cross to regulator inbox.
      await safe('cyber_incident_sla_sweep', async () => {
        const result = await cyberIncidentSlaSweep(env as never);
        console.log('cyber_incident_sla_sweep', JSON.stringify(result));
      });
      // Wave 27 — REIPPPP Economic Development commitment monitoring SLA sweep.
      // High-scoring (ownership/local_content) + mid (jobs/skills) breaches
      // cross to regulator inbox; community/SED/enterprise breaches stay internal.
      await safe('ed_commitment_sla_sweep', async () => {
        const result = await edCommitmentSlaSweep(env as never);
        console.log('ed_commitment_sla_sweep', JSON.stringify(result));
      });
      // Wave 28 — Grid Connection Agreement (UNGCA) chain SLA sweep.
      // Transmission + distribution breaches cross to regulator inbox (NERSA
      // Grid Code C-1); embedded SSEG breaches stay internal.
      await safe('gca_sla_sweep', async () => {
        const result = await gcaSlaSweep(env as never);
        console.log('gca_sla_sweep', JSON.stringify(result));
      });
      // Wave 29 — Trader Position Limit Compliance chain SLA sweep.
      // Cure-window expiry crosses to regulator inbox for ALL tiers (FSCA
      // Section 41 — forced-liquidation precursor).
      await safe('poslimit_sla_sweep', async () => {
        const result = await poslimitSlaSweep(env as never);
        console.log('poslimit_sla_sweep', JSON.stringify(result));
      });
      // Wave 30 — Lender disbursement UoP reconciliation SLA sweep.
      // Per-stage deadlines (60d invoices senior_a → 7d IE bridge); breach crosses
      // regulator inbox for senior_a + senior_b only (small bridges aggregated
      // monthly in Banking Sector Conduct Standards returns).
      await safe('disbursement_sla_sweep', async () => {
        const result = await disbursementSlaSweep(env as never);
        console.log('disbursement_sla_sweep', JSON.stringify(result));
      });
      // Wave 31 — Regulator compliance-notice disposition SLA sweep.
      // NERSA Act §10 90-day disposition rule; INVERTED tier SLA (critical 4h
      // triage, low 7d); breach crosses Council for ALL tiers (Section 10 hard
      // line, DG-level reporting).
      await safe('disposition_sla_sweep', async () => {
        const result = await dispositionSlaSweep(env as never);
        console.log('disposition_sla_sweep', JSON.stringify(result));
      });
      // Wave 32 — Offtaker Take-or-Pay annual reconciliation SLA sweep.
      // INVERTED tier SLA (catastrophic 30d quantum, minor 180d); breach
      // crosses regulator for ALL tiers (NERSA TOP annual return hard line).
      await safe('top_sla_sweep', async () => {
        const result = await topSlaSweep(env as never);
        console.log('top_sla_sweep', JSON.stringify(result));
      });
      // Wave 33 — NERSA Licence Renewal SLA sweep (s14-s16).
      // INVERTED class SLA (utility 180d evaluation, trading 30d); breach
      // crosses regulator for ALL classes (s14(2)(b) statutory hard line).
      await safe('licence_renewal_sla_sweep', async () => {
        const result = await licenceRenewalSlaSweep(env as never);
        console.log('licence_renewal_sla_sweep', JSON.stringify(result));
      });
      // Wave 34 — Grid CSC-1 Load Curtailment SLA sweep. URGENT matrix (higher
      // stage = TIGHTER deadline; stage_7_8 ack 5m, reconcile 24h). 15-min
      // cadence is the tightest available; stage_5_6+ breaches cross regulator.
      await safe('load_curtailment_sla_sweep', async () => {
        const result = await loadCurtailmentSlaSweep(env as never);
        console.log('load_curtailment_sla_sweep', JSON.stringify(result));
      });
      // Wave 35 — Esums O&M Warranty Vendor-Side Escalation SLA sweep. URGENT
      // matrix (safety_recall 4h triage; single_unit 7d). safety_recall +
      // fleet_systemic breaches cross regulator (CPA §61 / NRCS).
      await safe('vendor_escalation_sla_sweep', async () => {
        const result = await vendorEscalationSlaSweep(env as never);
        console.log('vendor_escalation_sla_sweep', JSON.stringify(result));
      });
      // Wave 36 — Trader Best-Execution / RFQ Compliance SLA sweep. MIXED
      // matrix (hard market windows on quote/approval/execution; protection-
      // graded TCA). retail + professional breaches cross FSCA (Conduct
      // Standard 1 of 2020); ECP best-ex waived.
      await safe('best_execution_sla_sweep', async () => {
        const result = await bestExecutionSlaSweep(env as never);
        console.log('best_execution_sla_sweep', JSON.stringify(result));
      });
      // W37 — Carbon project registration / PDD validation. INVERTED SLA
      // (higher-integrity tier gets more diligence time). afolu_redd +
      // large_scale breaches cross the regulator inbox.
      await safe('carbon_registration_sla_sweep', async () => {
        const result = await carbonRegistrationSlaSweep(env as never);
        console.log('carbon_registration_sla_sweep', JSON.stringify(result));
      });
      // W38 — Lender covenant compliance certificate. URGENT SLA (senior
      // secured tightest). senior + mezzanine SLA breaches cross the regulator
      // inbox (SARB large-exposure).
      await safe('covenant_certificate_sla_sweep', async () => {
        const result = await covenantCertificateSlaSweep(env as never);
        console.log('covenant_certificate_sla_sweep', JSON.stringify(result));
      });
      // W39 — Offtaker PPA tariff indexation / CPI escalation. MIXED SLA
      // (machinery uniform, dispute windows graded with utility_scale tightest).
      // utility + commercial SLA breaches cross the regulator inbox (ERA §4).
      await safe('tariff_indexation_sla_sweep', async () => {
        const result = await tariffIndexationSlaSweep(env as never);
        console.log('tariff_indexation_sla_sweep', JSON.stringify(result));
      });
      // W40 — Regulator Compliance Inspection & Enforcement. URGENT SLA (more
      // severe contravention = tighter window at every stage). critical +
      // serious SLA breaches cross the regulator inbox (NERSA ERA §10).
      await safe('compliance_inspection_sla_sweep', async () => {
        const result = await complianceInspectionSlaSweep(env as never);
        console.log('compliance_inspection_sla_sweep', JSON.stringify(result));
      });
      // W41 ITIL Problem Management SLA sweep — URGENT (major problem = tighter
      // window at every stage). Major-problem SLA breaches cross the regulator
      // inbox (market-availability / integrity).
      await safe('problem_management_sla_sweep', async () => {
        const result = await problemManagementSlaSweep(env as never);
        console.log('problem_management_sla_sweep', JSON.stringify(result));
      });
      // W42 Carbon Reversal / Buffer-Pool SLA sweep — URGENT (the larger the
      // reversal, the tighter the window). Material-tier (catastrophic +
      // significant) breaches cross the regulator inbox (market integrity).
      await safe('carbon_reversal_sla_sweep', async () => {
        const result = await carbonReversalSlaSweep(env as never);
        console.log('carbon_reversal_sla_sweep', JSON.stringify(result));
      });
      // W43 Tariff / Revenue (MYPD Price-Control) Determination SLA sweep —
      // INVERTED (the bigger the determination, the more time every window
      // allows). Material-class (multi_year + annual_tariff) breaches cross the
      // regulator inbox (Council oversight / public tariff register).
      await safe('tariff_determination_sla_sweep', async () => {
        const result = await tariffDeterminationSlaSweep(env as never);
        console.log('tariff_determination_sla_sweep', JSON.stringify(result));
      });
      // W44 Trade-Repository Reporting & Reconciliation SLA sweep — MIXED
      // (regulatory submission windows uniform T+1; recon/break windows graded,
      // otc tightest). THEMATIC INVERSION: a late / missing transaction report
      // IS the FMA violation, so every breach crosses to the FSCA supervisor.
      await safe('trade_reporting_sla_sweep', async () => {
        const result = await tradeReportingSlaSweep(env as never);
        console.log('trade_reporting_sla_sweep', JSON.stringify(result));
      });
      // W45 Loan Default & Enforcement / Step-in SLA sweep — URGENT (senior
      // secured tightest). write_off crosses ALL tiers (SARB impairment hard
      // line); accelerate + commence_enforcement + SLA breaches cross for
      // senior_secured + mezzanine only.
      await safe('loan_default_sla_sweep', async () => {
        const result = await loanDefaultSlaSweep(env as never);
        console.log('loan_default_sla_sweep', JSON.stringify(result));
      });
      // W46 Offtaker PPA Curtailment / Deemed-Energy Compensation SLA sweep —
      // URGENT (utility_scale tightest; debt-service depends on deemed-energy
      // cash flow). refer_arbitration crosses ALL tiers; reject_non_compensable
      // + settle_compensation + SLA breaches cross for utility_scale +
      // commercial only.
      await safe('curtailment_claim_sla_sweep', async () => {
        const result = await curtailmentClaimSlaSweep(env as never);
        console.log('curtailment_claim_sla_sweep', JSON.stringify(result));
      });
      // W47 — ITIL change-enablement RFC SLA sweep (URGENT; emergency_change
      // tightest). Breach events cross into the regulator inbox for
      // emergency_change only.
      await safe('change_enablement_sla_sweep', async () => {
        const result = await changeEnablementSlaSweep(env as never);
        console.log('change_enablement_sla_sweep', JSON.stringify(result));
      });
      // W48 — Carbon Tax Offset Claim & Allowance SLA sweep (INVERTED; the
      // larger the claim, the longer every window). Material-tier (major +
      // standard) breaches cross the regulator inbox (SARS / DFFE COAS).
      await safe('carbon_offset_claim_sla_sweep', async () => {
        const result = await carbonOffsetClaimSlaSweep(env as never);
        console.log('carbon_offset_claim_sla_sweep', JSON.stringify(result));
      });
      // W49 — Initial Licence Application & Adjudication SLA sweep (INVERTED; the
      // bigger the licence, the longer every §10 window). Material-class (major +
      // standard) breaches cross the regulator inbox (Council oversight).
      await safe('licence_application_sla_sweep', async () => {
        const result = await licenceApplicationSlaSweep(env as never);
        console.log('licence_application_sla_sweep', JSON.stringify(result));
      });
      // W50 — Grid Ancillary Services Reserve Activation SLA sweep (URGENT; the
      // faster the reserve product, the tighter the response window). Critical-tier
      // (instantaneous + regulating) breaches cross the regulator inbox (Grid Code).
      await safe('reserve_activation_sla_sweep', async () => {
        const result = await reserveActivationSlaSweep(env as never);
        console.log('reserve_activation_sla_sweep', JSON.stringify(result));
      });
      // W51 — Esums O&M availability-guarantee SLA sweep. URGENT (larger shortfall =
      // tighter window); critical-tier (severe + critical) breaches cross the
      // regulator inbox as a security-of-supply concern.
      await safe('availability_guarantee_sla_sweep', async () => {
        const result = await availabilityGuaranteeSlaSweep(env as never);
        console.log('availability_guarantee_sla_sweep', JSON.stringify(result));
      });
      // W52 — Trader market-abuse surveillance SLA sweep. URGENT (more severe
      // typology = tighter window); critical-tier (high_risk + critical_abuse)
      // breaches cross the FSCA market-abuse inbox.
      await safe('market_abuse_sla_sweep', async () => {
        const result = await marketAbuseSlaSweep(env as never);
        console.log('market_abuse_sla_sweep', JSON.stringify(result));
      });
      // W53 — Lender credit-facility origination SLA sweep. INVERTED (bigger
      // facility = MORE time); large-exposure-tier (major + systemic) breaches
      // cross the SARB large-exposure / prudential inbox.
      await safe('credit_origination_sla_sweep', async () => {
        const result = await creditOriginationSlaSweep(env as never);
        console.log('credit_origination_sla_sweep', JSON.stringify(result));
      });
      // W54 — Offtaker PPA payment-security SLA sweep. URGENT (bigger secured
      // exposure = TIGHTER); major + critical breaches cross the NERSA inbox.
      await safe('payment_security_sla_sweep', async () => {
        const result = await paymentSecuritySlaSweep(env as never);
        console.log('payment_security_sla_sweep', JSON.stringify(result));
      });
      // W55 — OEM-Support firmware / vulnerability-remediation SLA sweep. URGENT
      // (higher CVSS severity = TIGHTER); critical breaches cross the regulator inbox.
      await safe('security_remediation_sla_sweep', async () => {
        const result = await securityRemediationSlaSweep(env as never);
        console.log('security_remediation_sla_sweep', JSON.stringify(result));
      });
      // W56 — Carbon crediting-period renewal SLA sweep. INVERTED (larger annual
      // issuance = LONGER window); auto-LAPSES renewal_due rows past their
      // submission window (TIME-DRIVEN) and crosses the regulator inbox on
      // large-tier (major + mega) breaches.
      await safe('crediting_renewal_sla_sweep', async () => {
        const result = await creditingRenewalSlaSweep(env as never);
        console.log('crediting_renewal_sla_sweep', JSON.stringify(result));
      });
      // W57 — Embedded-generation registration (Schedule 2 exemption) SLA sweep.
      // INVERTED (bigger embedded generator = LONGER window); records breaches and
      // crosses the regulator inbox on large + utility tiers.
      await safe('sseg_registration_sla_sweep', async () => {
        const result = await ssegRegistrationSlaSweep(env as never);
        console.log('sseg_registration_sla_sweep', JSON.stringify(result));
      });
      // W58 — Grid connection capacity allocation SLA sweep. INVERTED (bigger
      // requested connection = LONGER window — deeper load-flow / system-impact
      // study); records breaches and crosses the regulator inbox on large +
      // strategic tiers.
      await safe('grid_capacity_sla_sweep', async () => {
        const result = await gridCapacitySlaSweep(env as never);
        console.log('grid_capacity_sla_sweep', JSON.stringify(result));
      });
      // W59 — Esums preventive-maintenance schedule-compliance SLA sweep. URGENT
      // (more critical PM = TIGHTER response window — a lapsing safety-critical PM
      // is a protection-system hazard); records breaches and crosses the regulator
      // inbox on critical + safety-critical tiers.
      await safe('pm_compliance_sla_sweep', async () => {
        const result = await pmComplianceSlaSweep(env as never);
        console.log('pm_compliance_sla_sweep', JSON.stringify(result));
      });
      // W60 — Trader algo/DEA trading-system certification SLA sweep. INVERTED
      // (larger authorised footprint = LONGER window — deeper conformance + risk-
      // control testing); deployed + terminals carry no deadline; records breaches
      // and crosses the regulator inbox on high_impact + systemic tiers.
      await safe('algo_cert_sla_sweep', async () => {
        const result = await algoCertSlaSweep(env as never);
        console.log('algo_cert_sla_sweep', JSON.stringify(result));
      });
      // W61 loan-transfer / secondary-participation SLA sweep — INVERTED windows
      // (bigger transfer = more screening/consent/regulatory/settlement time);
      // terminals carry no deadline; records breaches and crosses the regulator
      // inbox on large (major + systemic) tiers.
      await safe('loan_transfer_sla_sweep', async () => {
        const result = await loanTransferSlaSweep(env as never);
        console.log('loan_transfer_sla_sweep', JSON.stringify(result));
      });
      // W62 PPA termination & buy-out SLA sweep — MIXED windows (cure / eta_assessment
      // / dispute INVERTED, settlement_pending URGENT); terminals carry no deadline;
      // records breaches and crosses the regulator inbox on large (major + critical)
      // tiers.
      await safe('ppa_termination_sla_sweep', async () => {
        const result = await ppaTerminationSlaSweep(env as never);
        console.log('ppa_termination_sla_sweep', JSON.stringify(result));
      });
      // Wave 63 — Warranty-Recovery / Supplier-Recovery claim SLA sweep (MIXED:
      // claim_drafted / under_assessment / disputed INVERTED, recovery_pending
      // URGENT); terminals carry no deadline; records breaches and crosses the
      // regulator inbox on large (major + critical) tiers.
      await safe('warranty_recovery_sla_sweep', async () => {
        const result = await warrantyRecoverySlaSweep(env as never);
        console.log('warranty_recovery_sla_sweep', JSON.stringify(result));
      });
      // Wave 64 — Permit-to-Work (PTW) / LOTO SLA sweep (URGENT: the more
      // hazardous the permit, the tighter the window; terminals carry no
      // deadline); records breaches and crosses the regulator inbox on the top
      // hazard tiers (critical + catastrophic).
      await safe('permit_to_work_sla_sweep', async () => {
        const result = await permitToWorkSlaSweep(env as never);
        console.log('permit_to_work_sla_sweep', JSON.stringify(result));
      });
      // Wave 65 — Carbon ERPA Forward Delivery & Make-Good SLA sweep (INVERTED:
      // bigger forward sale gets the longer window; terminals carry no deadline);
      // records breaches and crosses the regulator inbox on the large tiers
      // (major + mega).
      await safe('carbon_erpa_sla_sweep', async () => {
        const result = await carbonErpaSlaSweep(env as never);
        console.log('carbon_erpa_sla_sweep', JSON.stringify(result));
      });
      // Wave 66 — Regulator Complaints & Dispute Resolution SLA sweep (URGENT:
      // larger affected population = tighter window; terminals carry no
      // deadline); records breaches and crosses the regulator inbox on the
      // large tiers (major + systemic).
      await safe('complaint_resolution_sla_sweep', async () => {
        const result = await complaintResolutionSlaSweep(env as never);
        console.log('complaint_resolution_sla_sweep', JSON.stringify(result));
      });
      // Wave 67 — Grid Code Compliance Monitoring & Non-Conformance SLA sweep
      // (URGENT: more severe non-conformance = tighter window; terminals carry no
      // deadline); records breaches and crosses the regulator inbox on the large
      // tiers (serious + critical).
      await safe('grid_code_compliance_sla_sweep', async () => {
        const result = await gridCodeComplianceSlaSweep(env as never);
        console.log('grid_code_compliance_sla_sweep', JSON.stringify(result));
      });
      // Wave 68 — Counterparty Margin Call & Default Management SLA sweep
      // (URGENT: larger exposure-at-risk = tighter window; terminals carry no
      // deadline); records breaches and crosses the regulator inbox on the high
      // tiers (major + systemic).
      await safe('counterparty_margin_sla_sweep', async () => {
        const result = await counterpartyMarginSlaSweep(env as never);
        console.log('counterparty_margin_sla_sweep', JSON.stringify(result));
      });
      // Wave 69 — Security / Collateral Perfection & Registration SLA sweep
      // (URGENT: larger / more critical security = tighter perfection window;
      // perfected + terminals carry no deadline); records breaches and crosses
      // the regulator inbox on the high tiers (major + critical).
      await safe('security_perfection_sla_sweep', async () => {
        const result = await securityPerfectionSlaSweep(env as never);
        console.log('security_perfection_sla_sweep', JSON.stringify(result));
      });
      // W70 — REC / Guarantee-of-Origin certificate lifecycle: breach any open
      // certificate past its (INVERTED) verification window and cross the regulator
      // inbox on the high tiers (major + critical).
      await safe('rec_lifecycle_sla_sweep', async () => {
        const result = await recLifecycleSlaSweep(env as never);
        console.log('rec_lifecycle_sla_sweep', JSON.stringify(result));
      });
      // W71 — Esums predictive asset-health prognostics: breach any open
      // prognostic past its (URGENT) window and cross the regulator inbox on the
      // high tiers (major + critical).
      await safe('asset_prognostics_sla_sweep', async () => {
        const result = await assetPrognosticsSlaSweep(env as never);
        console.log('asset_prognostics_sla_sweep', JSON.stringify(result));
      });
      // W72 — OEM-Support spare-parts provisioning: breach any open provisioning
      // line past its (URGENT) window and cross the regulator inbox on the HIGH
      // tiers (critical + catastrophic) as a security-of-supply risk.
      await safe('spare_parts_provisioning_sla_sweep', async () => {
        const result = await sparePartsProvisioningSlaSweep(env as never);
        console.log('spare_parts_provisioning_sla_sweep', JSON.stringify(result));
      });
      // W73 — Carbon PoA/CPA inclusion: breach any open CPA inclusion past its
      // (INVERTED) window and cross the regulator inbox on the large tiers
      // (large + mega) as a programme-conformance risk.
      await safe('poa_cpa_inclusion_sla_sweep', async () => {
        const result = await poaCpaInclusionSlaSweep(env as never);
        console.log('poa_cpa_inclusion_sla_sweep', JSON.stringify(result));
      });
      // W74 — Regulator NERSA levy assessment & collection: breach any open levy
      // past its (URGENT) window and cross the regulator inbox on the large +
      // major tiers as a collection / good-standing risk.
      await safe('levy_assessment_sla_sweep', async () => {
        const result = await levyAssessmentSlaSweep(env as never);
        console.log('levy_assessment_sla_sweep', JSON.stringify(result));
      });
      // W75 connection-energization: flag commissioning hold-points that overrun
      // their (INVERTED) window and cross the regulator inbox on the large tiers
      // (transmission + bulk) as a connection-programme delivery risk.
      await safe('connection_energization_sla_sweep', async () => {
        const result = await connectionEnergizationSlaSweep(env as never);
        console.log('connection_energization_sla_sweep', JSON.stringify(result));
      });
      // W76 trade-allocation: flag post-execution processing steps (allocate ->
      // confirm -> affirm -> match -> settle) that overrun their URGENT window and
      // cross the regulator inbox on the large tiers (large + block) under CSDR-style
      // settlement discipline.
      await safe('trade_allocation_sla_sweep', async () => {
        const result = await tradeAllocationSlaSweep(env as never);
        console.log('trade_allocation_sla_sweep', JSON.stringify(result));
      });
      // W77 reserve-account (DSRA/MRA): flag funding / shortfall-cure / drawdown-
      // replenish / release steps that overrun their URGENT window and cross the
      // regulator inbox on the large tiers (major + systemic).
      await safe('reserve_account_sla_sweep', async () => {
        const result = await reserveAccountSlaSweep(env as never);
        console.log('reserve_account_sla_sweep', JSON.stringify(result));
      });
      // W78 PPA change-in-law: flag eligibility / impact / negotiation /
      // arbitration / relief steps that overrun their INVERTED window; SLA
      // breaches cross the regulator inbox on the large tiers (major + critical).
      await safe('ppa_change_in_law_sla_sweep', async () => {
        const result = await ppaChangeInLawSlaSweep(env as never);
        console.log('ppa_change_in_law_sla_sweep', JSON.stringify(result));
      });
      // W79 generation revenue assurance: flag recon periods that overrun their
      // URGENT window (larger variance chased harder); SLA breaches cross the
      // regulator inbox on the large tiers (major + critical).
      await safe('generation_revenue_assurance_sla_sweep', async () => {
        const result = await generationRevenueAssuranceSlaSweep(env as never);
        console.log('generation_revenue_assurance_sla_sweep', JSON.stringify(result));
      });
      // W80 service contracts: flag contracts that overrun their URGENT renewal-
      // window (higher coverage tier chased harder); SLA breaches cross the
      // regulator inbox on the HIGH tiers (premium + mission_critical).
      await safe('service_contract_sla_sweep', async () => {
        const result = await serviceContractSlaSweep(env as never);
        console.log('service_contract_sla_sweep', JSON.stringify(result));
      });
      // W81 project change-orders: flag variations that overrun their INVERTED
      // variation-control SLA (larger variation = more time); SLA breaches cross
      // the regulator inbox on the HIGH tiers (major + critical).
      await safe('project_change_order_sla_sweep', async () => {
        const result = await projectChangeOrderSlaSweep(env as never);
        console.log('project_change_order_sla_sweep', JSON.stringify(result));
      });
      // W82 carbon issuances: flag mints that overrun their INVERTED issuance
      // SLA (larger volume = more time = deeper diligence); SLA breaches cross
      // the regulator inbox on the LARGE tiers (major + mega).
      await safe('carbon_issuance_sla_sweep', async () => {
        const result = await carbonIssuanceSlaSweep(env as never);
        console.log('carbon_issuance_sla_sweep', JSON.stringify(result));
      });
      // W83 NERSA consultation notices: flag consultations that overrun their
      // INVERTED public-participation SLA (landmark gets the longest window);
      // SLA breaches cross the regulator inbox on the LARGE tiers (material +
      // landmark) only — small/standard consultations breach internally.
      await safe('consultation_notice_sla_sweep', async () => {
        const result = await consultationNoticeSlaSweep(env as never);
        console.log('consultation_notice_sla_sweep', JSON.stringify(result));
      });
      // W84 Grid Black-Start Capability Contracting & System-Restoration Drill: flag
      // BSC chains that overrun their URGENT SLA (larger unit/island_critical = tighter
      // window); SLA breaches cross the regulator inbox on material + island_critical
      // tiers only (smaller minor/standard breach internally).
      await safe('black_start_sla_sweep', async () => {
        const result = await blackStartSlaSweep(env as never);
        console.log('black_start_sla_sweep', JSON.stringify(result));
      });
      // W85 Trader Settlement Fails Management & CSDR-style Buy-In/Sell-Out: flag
      // settlement-fail chains that overrun their URGENT SLA (larger fail = tighter
      // window); SLA breaches cross the regulator inbox on material + systemic tiers
      // only (smaller minor/standard breach internally).
      await safe('settlement_fail_sla_sweep', async () => {
        const result = await settlementFailSlaSweep(env as never);
        console.log('settlement_fail_sla_sweep', JSON.stringify(result));
      });
      // W86 Lender DSCR Monitoring & Cure: flag periods that overrun their URGENT SLA
      // (lower DSCR = tighter window); SLA breaches cross the regulator inbox on
      // material + severe tiers only (minor/standard breach internally).
      await safe('dscr_monitoring_sla_sweep', async () => {
        const result = await dscrMonitoringSlaSweep(env as never);
        console.log('dscr_monitoring_sla_sweep', JSON.stringify(result));
      });
      // W87 Offtaker PPA Scheduled-Energy Nomination & Deviation Settlement: flag
      // nomination periods that overrun their URGENT SLA (larger deviation = tighter
      // window); SLA breaches cross the regulator inbox on material + major tiers
      // (minor/standard breach internally).
      await safe('ppa_nomination_sla_sweep', async () => {
        const result = await ppaNominationSlaSweep(env as never);
        console.log('ppa_nomination_sla_sweep', JSON.stringify(result));
      });
      // W88 Esums BESS State-of-Health Monitoring & Capacity-Augmentation: flag
      // programmes that overrun their URGENT SLA (lower SOH band = tighter window);
      // SLA breaches cross the regulator inbox on heavy tiers (material + critical).
      await safe('bess_soh_sla_sweep', async () => {
        const result = await bessSohSlaSweep(env as never);
        console.log('bess_soh_sla_sweep', JSON.stringify(result));
      });
      // W89 OEM-Support Field Change Order / ECN Campaign Management: flag
      // campaigns that overrun their URGENT SLA (mandatory_safety = tightest);
      // SLA breaches cross the regulator inbox on mandatory tiers only.
      await safe('oem_fco_sla_sweep', async () => {
        const result = await oemFcoSlaSweep(env as never);
        console.log('oem_fco_sla_sweep', JSON.stringify(result));
      });
      // W90 Trader JIBAR Cessation Benchmark Transition: flag transitions
      // past their URGENT SLA window (larger notional = tighter); SLA
      // breaches cross the regulator inbox for material+systemic tiers per
      // SARB MPG schedule-slippage reporting.
      await safe('benchmark_transition_sla_sweep', async () => {
        const result = await benchmarkTransitionSlaSweep(env as never);
        console.log('benchmark_transition_sla_sweep', JSON.stringify(result));
      });
      // W91 Carbon ICVCM CCP-eligibility Assessment & Label Lifecycle: flag
      // assessments past their INVERTED SLA window (larger assessed volume =
      // longer windows, deeper rating diligence). SLA breaches on major+mega
      // tiers cross the regulator inbox as integrity-mark workflow slippage.
      await safe('ccp_assessment_sla_sweep', async () => {
        const result = await ccpAssessmentSlaSweep(env as never);
        console.log('ccp_assessment_sla_sweep', JSON.stringify(result));
      });
      // W92 IPP Project Risk Register & SRA: flag risks past their INVERTED
      // SLA window (larger EMV = longer windows, deeper Monte-Carlo). SLA
      // breaches on high+critical tiers cross the regulator inbox as project
      // risk-management slippage.
      await safe('project_risk_sla_sweep', async () => {
        const result = await projectRiskSlaSweep(env as never);
        console.log('project_risk_sla_sweep', JSON.stringify(result));
      });
      // ERA s35 enforcement-action SLA sweep — Wave 93. Procedural-window
      // misses cross the regulator inbox for material+severe tiers (judicial-
      // review risk under PAJA s4 + ERA s35(3)).
      await safe('enforcement_action_sla_sweep', async () => {
        const result = await enforcementActionSlaSweep(env as never);
        console.log('enforcement_action_sla_sweep', JSON.stringify(result));
      });
      // NTCSA REZ capacity allocation SLA sweep — Wave 94. Procedural-window
      // misses on the competitive-auction stack cross the regulator inbox for
      // material+mega tiers (multi-criteria diligence under NTCSA Rules 2024).
      await safe('rez_capacity_sla_sweep', async () => {
        const result = await rezCapacitySlaSweep(env as never);
        console.log('rez_capacity_sla_sweep', JSON.stringify(result));
      });
      // Lender SLL KPI Compliance & Margin Ratchet SLA sweep — Wave 95.
      // Procedural-window misses on annual KPI cycles cross the regulator
      // inbox for material+severe tiers (SARB CPS 2024 + SA Green Finance
      // Taxonomy 2025 mandatory-disclosure obligation).
      await safe('sll_kpi_sla_sweep', async () => {
        const result = await sllKpiSlaSweep(env as never);
        console.log('sll_kpi_sla_sweep', JSON.stringify(result));
      });
      // IPP Submittal & RFI Register SLA sweep — Wave 96. URGENT-polarity
      // construction-document SLAs (critical/high beat tighter). Breaches on
      // chains carrying affects_grid_code OR holds_construction cross the
      // regulator inbox (NERSA Grid Code C-1/C-3 + REIPPPP bid-envelope).
      await safe('submittal_rfi_sla_sweep', async () => {
        const result = await submittalRfiSlaSweep(env as never);
        console.log('submittal_rfi_sla_sweep', JSON.stringify(result));
      });
      // IPP Daily Field Report / Progress Diary SLA sweep — Wave 97.
      // URGENT-polarity construction-day diaries (safety = tightest).
      // Breaches on chains carrying triggers_hse_incident OR
      // triggers_change_order cross the regulator inbox.
      await safe('dfr_sla_sweep', async () => {
        const result = await dfrSlaSweep(env as never);
        console.log('dfr_sla_sweep', JSON.stringify(result));
      });
      // IPP Punch List / COD Snag Handover SLA sweep — Wave 98.
      // URGENT-polarity construction-completion defects (critical = tightest).
      // Breaches on chains carrying blocks_commercial_operation OR
      // life_safety_critical cross the regulator inbox.
      await safe('punch_list_sla_sweep', async () => {
        const result = await punchListSlaSweep(env as never);
        console.log('punch_list_sla_sweep', JSON.stringify(result));
      });
      // IPP ITP / Quality Inspection & Test Plan SLA sweep — Wave 99.
      // URGENT-polarity hold-point quality gates (safety/COD = tightest).
      // Breaches on safety_critical_test always cross regulator; breaches on
      // blocks_commercial_operation cross at high+critical tiers.
      await safe('itp_sla_sweep', async () => {
        const result = await itpSlaSweep(env as never);
        console.log('itp_sla_sweep', JSON.stringify(result));
      });
      // IPP Mechanical/Electrical Handover Dossier SLA sweep — Wave 100.
      // URGENT polarity (warranty-clock-running = tightest). Breaches on
      // blocks_warranty_start always cross regulator; breaches on
      // blocks_om_handover cross at high+critical tiers.
      await safe('handover_dossier_sla_sweep', async () => {
        const result = await handoverDossierSlaSweep(env as never);
        console.log('handover_dossier_sla_sweep', JSON.stringify(result));
      });
      // W101 Offtaker PPA Annual Reconciliation & True-Up: flag closed years
      // that overrun their INVERTED SLA (larger variance = MORE time for
      // forensic reconciliation, audit walkthroughs, counterparty signoff).
      // SLA breaches cross the regulator inbox on material + major tiers.
      await safe('ppa_annual_recon_sla_sweep', async () => {
        const result = await ppaAnnualReconSlaSweep(env as never);
        console.log('ppa_annual_recon_sla_sweep', JSON.stringify(result));
      });
      // W102 Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain
      // Audit: flag soiling audits that overrun their URGENT SLA (higher
      // soiling band = TIGHTER windows; production-loss family). SLA breaches
      // cross the regulator inbox on material + severe tiers (NERSA REIPPPP
      // production reporting + DFFE water-use).
      await safe('soiling_audit_sla_sweep', async () => {
        const result = await soilingAuditSlaSweep(env as never);
        console.log('soiling_audit_sla_sweep', JSON.stringify(result));
      });
      // W103 Carbon ESG Disclosure Lifecycle & Assurance: flag disclosures
      // that overrun their INVERTED SLA window (strategic = longest window
      // because a full annual cycle is 270 days; minor publish = 7 days).
      // SLA breaches cross the regulator inbox on strategic tier only
      // (filing-deadline miss = signature crossing alongside W103
      // restate-universal / qualified-assurance material+strategic /
      // cancel-of-listed-year universal).
      await safe('esg_disclosure_sla_sweep', async () => {
        const result = await esgDisclosureSlaSweep(env as never);
        console.log('esg_disclosure_sla_sweep', JSON.stringify(result));
      });
      // W104 Support ITIL Service Request Fulfilment chain: flag requests
      // that overrun their URGENT SLA window (higher tier = TIGHTER, so a
      // critical service request has 4h on submitted and a minor has 14d).
      // SLA breaches cross the regulator inbox on material + critical tiers
      // (signature alongside reject-everywhere-when-regulator-relevant,
      // mark_fulfilled-on-critical-when-grid-significant, and
      // cancel-everywhere-when-entitled-and-regulator-relevant).
      await safe('service_request_sla_sweep', async () => {
        const result = await serviceRequestSlaSweep(env as never);
        console.log('service_request_sla_sweep', JSON.stringify(result));
      });
      // W105 Grid Wholesale Imbalance Settlement chain: flag MTU settlement
      // periods that overrun their URGENT SLA window (higher tier = TIGHTER,
      // so a systemic period has 12h on period_open and a minor has 14d).
      // SLA breaches cross the regulator inbox on material + systemic tiers
      // (signature alongside raise_dispute-on-HV-every-tier, mark_settled-on-
      // heavy-with-penalty, aged_arrears-every-tier-at-60d, and
      // cancel_period-every-tier-when-imbalance-nonzero).
      await safe('imbalance_settlement_sla_sweep', async () => {
        const result = await imbalanceSettlementSlaSweep(env as never);
        console.log('imbalance_settlement_sla_sweep', JSON.stringify(result));
      });
      // W106 Regulator NERSA s35 Enforcement Action chain: flag enforcement
      // cases past their INVERTED SLA window (strategic gets longest — PAJA
      // s5 procedural fairness needs more time at higher tiers; strategic
      // 180d on triggered vs minor 30d). SLA breaches cross the regulator
      // inbox on material + strategic tiers (PAJA fairness review exposure)
      // alongside impose_sanction-when-licence_revocation, commence_enforcement
      // -on-strategic-or-criminal_intelligence, mark_settled-on-significant-
      // sanctions.
      await safe('enforcement_action_s35_sla_sweep', async () => {
        const result = await enforcementActionS35SlaSweep(env as never);
        console.log('enforcement_action_s35_sla_sweep', JSON.stringify(result));
      });
      // W107 Trader Pre-Trade Credit & Settlement-Risk chain: flag pre-
      // trade checks past their URGENT sub-second SLA (systemic 500ms,
      // material 2s, standard 10s, micro 30s on order_submitted). Granular
      // cron is 1-min so this sweep mostly catches lingering 15-min-old
      // breaches; tight detection runs client-side on every read via
      // decorate(). SLA breaches cross regulator on systemic only (BIS
      // PFMI s3.5) alongside reject_order-EVERY-tier-on-below-B-grade,
      // override_rejection-EVERY-tier, and hold_for_review-on-material-
      // plus-systemic-when-SLA-triggered.
      await safe('pretrade_credit_sla_sweep', async () => {
        const result = await pretradeCreditSlaSweep(env as never);
        console.log('pretrade_credit_sla_sweep', JSON.stringify(result));
      });
      // W108 Lender Loan Restructure & A&E — SLA sweep. INVERTED polarity
      // stored in HOURS (systemic 180d on trigger_event, minor 30d). Walks
      // every active row whose sla_deadline_at has elapsed, flips
      // sla_breached=1, bumps escalation_level, fires a
      // loan_restructure_sla_breached event. SLA breach crosses regulator
      // on material+systemic (LMA Amend&Extend + SARB Banks Act §61
      // forbearance disclosure). 15-min cron tick is granular enough — the
      // chain itself is multi-week. Sister of W38/W86/W45 in the Lender
      // forbearance pipeline.
      await safe('loan_restructure_sla_sweep', async () => {
        const result = await loanRestructureSlaSweep(env as never);
        console.log('loan_restructure_sla_sweep', JSON.stringify(result));
      });
      // W109 Carbon Credit Quality Rating & Continuous Re-rating — SLA
      // sweep. INVERTED polarity stored in HOURS (institutional 180d on
      // rating_requested, basic 30d). Walks every active row whose
      // sla_deadline_at has elapsed, flips sla_breached=1, bumps
      // escalation_level, fires carbon_rating_sla_breached event. SLA
      // breach crosses regulator on premium+institutional only (CCP +
      // ICROA + Article 6.4 disclosure threshold). 15-min cron tick is
      // granular enough — the chain itself is multi-week. Beats Sylvera /
      // BeZero / Pachama / Renoster / Calyx static letter-ratings by
      // running the deadline machine continuously.
      await safe('carbon_credit_rating_sla_sweep', async () => {
        const result = await carbonCreditRatingSlaSweep(env as never);
        console.log('carbon_credit_rating_sla_sweep', JSON.stringify(result));
      });
      // W110 Grid Transmission Outage Coordination & N-1 Security — SLA
      // sweep. URGENT polarity stored in HOURS (critical_400kv_plus 24h on
      // outage_requested, low_sub132kv 336h). Walks every active row whose
      // sla_deadline_at has elapsed, flips sla_breached=1, bumps
      // escalation_level, fires transmission_outage_sla_breached event.
      // SLA breach crosses regulator on high_275kv + critical_400kv_plus
      // (NERSA Grid Code C-3 disclosure rule). 15-min tick is granular
      // enough — the chain spans days/weeks across 11 lifecycle states.
      // Distinct from W18 planned outage (asset-owner driven on IPP
      // generators); W110 is the SO-driven transmission-network corridor
      // outage coordination machine.
      await safe('transmission_outage_sla_sweep', async () => {
        const result = await transmissionOutageSlaSweep(env as never);
        console.log('transmission_outage_sla_sweep', JSON.stringify(result));
      });
      // W111 Trader Daily P&L Attribution & Risk-Adjusted Returns — SLA
      // sweep. URGENT polarity stored in HOURS on day_open anchor: minor 24h,
      // standard 18h, material 12h, systemic 6h. Walks every active row whose
      // sla_deadline_at has elapsed, flips sla_breached=1, bumps
      // escalation_level, fires pnl_attribution_sla_breached event. SLA
      // breach crosses regulator on material + systemic (FMA Ch.X + FSCA
      // Conduct Standard 1/2020 + IFRS 13 fair-value-on-time disclosure). 15-
      // min tick is granular enough — systemic SLA is 6h. Distinct from W2
      // (rolling VaR) which is a continuous market-risk monitor; W111 is the
      // EOD P&L decomposition + GIPS-2020 risk-adjusted returns + IFRS 9
      // stage classification machine.
      await safe('pnl_attribution_sla_sweep', async () => {
        const result = await pnlAttributionSlaSweep(env as never);
        console.log('pnl_attribution_sla_sweep', JSON.stringify(result));
      });
      // Wave 112 — IPP WBS & Gantt schedule SLA sweep. INVERTED polarity:
      // small 5d, medium 10d, large 20d, mega 30d on variance_detected
      // anchor (larger projects get LONGER cure runway). Walks every active
      // schedule row whose sla_deadline_at has elapsed, flips
      // sla_breached=1, bumps escalation_level, fires
      // ipp_schedule_sla_breached event. SLA breach crosses regulator on
      // large + mega (REIPPPP §6 + NERSA Grid Code C-5 disclosure). Distinct
      // from W19 (procurement front-end), W20 (COD), W23 (insurance claim),
      // W25 (HSE incident), W27 (REIPPPP ED commitment), W28 (Grid
      // Connection Agreement). W112 is the WBS baseline + Gantt + EVM
      // (CPI/SPI/SPI_t) + variance + rebaseline + recovery engine.
      await safe('ipp_schedule_sla_sweep', async () => {
        const result = await ippScheduleSlaSweep(env as never);
        console.log('ipp_schedule_sla_sweep', JSON.stringify(result));
      });
      // Wave 113 — IPP Cost Management & EVM SLA sweep. INVERTED polarity:
      // small 72h, medium 168h, large 336h, mega 480h on variance_detected
      // anchor (larger budgets get LONGER cure runway). Walks every active
      // oe_ipp_evm row whose sla_deadline_at has elapsed, flips
      // sla_breached=1, bumps escalation_level, fires
      // ipp_evm_sla_breached event. SLA breach crosses regulator on
      // large + mega (PMBOK 7 + AACE RP-67R-11 + ANSI EIA-748-D
      // disclosure). Distinct from W112 (schedule), W21 (drawdown), W30
      // (disbursement UoP), W77 (reserve-account). W113 is the BAC +
      // committed/incurred + PV/EV/AC + CPI/SPI + EAC/ETC/TCPI + VAC +
      // contingency/MR + variance + reforecast + CR + reconcile engine.
      await safe('ipp_evm_sla_sweep', async () => {
        const result = await ippEvmSlaSweep(env as never);
        console.log('ipp_evm_sla_sweep', JSON.stringify(result));
      });
      // W114 — IPP Document Control & Drawing Register SLA sweep.
      // Walks every active oe_ipp_document_control row whose
      // sla_deadline_at has elapsed (URGENT polarity: safety_critical
      // 24h / electrical 72h / mechanical 120h / civil 168h on
      // transmitted anchor), flips sla_breached=1, bumps
      // escalation_level, fires ipp_doc_control_sla_breached event.
      // SLA breach crosses regulator on safety_critical + electrical
      // (heavy tiers). Distinct from W112 (schedule), W113 (cost-book).
      // W114 is the drawing-register + IDC + transmittal + reviewed +
      // commented + revised + approved + IFC + as-built + archive engine.
      await safe('ipp_doc_control_sla_sweep', async () => {
        const result = await ippDocControlSlaSweep(env as never);
        console.log('ipp_doc_control_sla_sweep', JSON.stringify(result));
      });
      // Wave 115 - IPP Submittal/Transmittal chain. URGENT SLA polarity (HOURS):
      // critical_safety 24h / shop_drawing 168h / material_approval 240h /
      // om_manual 480h. SIGNATURE STAMP-E-REJECT-CRITICAL on regulator crossing.
      await safe('ipp_submittal_sla_sweep', async () => {
        const result = await ippSubmittalSlaSweep(env as never);
        console.log('ipp_submittal_sla_sweep', JSON.stringify(result));
      });
      // Wave 116 - IPP RFI (Request For Information) chain. URGENT SLA polarity
      // (HOURS): emergency_safety 4h / construction_blocking 24h /
      // coordination 72h / clarification 168h. SIGNATURE SAFETY-RFI-ESCALATE
      // crosses regulator EVERY tier when safety_hazard_identified ||
      // regulatory_inquiry_triggered. Sister of W112/W113/W114/W115 Phase-A
      // IPP wave family. SLA breach crosses regulator on emergency_safety +
      // construction_blocking heavy tiers only.
      await safe('ipp_rfi_sla_sweep', async () => {
        const result = await ippRfiSlaSweep(env as never);
        console.log('ipp_rfi_sla_sweep', JSON.stringify(result));
      });
      // Wave 117 - IPP Change Orders & Variations chain. INVERTED SLA polarity
      // (HOURS) anchored on owner_review: minor 168h / material 336h /
      // major 720h / transformational 1080h. SIGNATURE SCOPE-BASELINE-CHANGE-
      // APPROVE crosses regulator EVERY tier when scope_baseline_change ||
      // regulatory_re_consent_required. 12th and TARGET-CLOSING Phase-A IPP
      // pure chain (W1/W10/W19/W20/W23/W27/W112/W113/W114/W115/W116/W117).
      // reject crosses regulator EVERY tier when cumulative_change_value_pct
      // >= 15. dispute crosses regulator major + transformational only.
      await safe('ipp_change_order_sla_sweep', async () => {
        const result = await ippChangeOrderSlaSweep(env as never);
        console.log('ipp_change_order_sla_sweep', JSON.stringify(result));
      });
      // Wave 118 - Hash-Chain Audit Trees & Tamper-Evident Ledger. Phase-B
      // opener / FIRST L5 hardening wave. Platform-wide audit chain spine
      // (NOT IPP). 15-min SLA sweep over every active block. SLA breach
      // crosses regulator on monthly + quarterly tiers (heavy NERSA/IPPO/
      // SARB attestation windows). INVERTED polarity - quarterly tier gets
      // LONGEST runway (168h on block_proposed) - more diligence time when
      // the block volume / regulator visibility is highest.
      await safe('audit_chain_sla_sweep', async () => {
        const result = await auditChainSlaSweep(env as never);
        console.log('audit_chain_sla_sweep', JSON.stringify(result));
      });
      // Wave 119 — Certified Regulator Export Packs.
      // 15-min SLA sweep over every active pack. INVERTED polarity:
      // ad_hoc 24h / monthly_return 72h / quarterly_attestation 168h /
      // half_year 240h / annual_audit 480h. SLA breach crosses regulator
      // on heavy tiers (quarterly_attestation / half_year / annual_audit)
      // because that is where NERSA/IPPO/SARB/JSE visibility is greatest.
      await safe('regulator_export_sla_sweep', async () => {
        const result = await regulatorExportSlaSweep(env as never);
        console.log('regulator_export_sla_sweep', JSON.stringify(result));
      });
      // Wave 120 — Reconciliation Attestation SLA sweep.
      // 15-min sweep over every active attestation. INVERTED HOUR polarity:
      // daily 24h / weekly 96h / monthly 168h / quarterly 360h / annual
      // 720h. Sla breach crosses regulator on heavy tiers (quarterly +
      // annual) because that is where the ICFR-DEFICIENCY-ATTEST regulator
      // visibility is greatest (JSE Listings 8.62 + Companies Act s30).
      await safe('reconciliation_attestation_sla_sweep', async () => {
        const result = await reconciliationAttestationSlaSweep(env as never);
        console.log('reconciliation_attestation_sla_sweep', JSON.stringify(result));
      });
      // Wave 121 — Control-Environment Audit SLA sweep.
      // 15-min sweep over every active control dossier. INVERTED HOUR
      // polarity: preventive 168h / detective 240h / corrective 360h /
      // directive 480h / governance 720h. SLA breach crosses regulator on
      // heavy tiers (directive + governance) because that is where listed-
      // issuer disclosure visibility under JSE 8.62 + Companies Act s30 +
      // SSAE 18 is greatest.
      await safe('control_environment_audit_sla_sweep', async () => {
        const result = await controlEnvironmentAuditSlaSweep(env as never);
        console.log('control_environment_audit_sla_sweep', JSON.stringify(result));
      });
      // W122 SCADA connector — 15-min sweep over every active connector.
      // INVERTED HOUR polarity (pilot 168 / small 240 / medium 360 /
      // large 480 / national 720). SLA breach crosses regulator on heavy
      // tiers only (large_substation + national_grid_backbone) under
      // NERSA Grid Code C-3 + SARB BA 700.
      await safe('scada_connector_sla_sweep', async () => {
        const result = await scadaConnectorSlaSweep(env as never);
        console.log('scada_connector_sla_sweep', JSON.stringify(result));
      });
      // W123 MQTT / OPC-UA IIoT connector — 15-min sweep over every
      // active connector. INVERTED HOUR polarity (edge_device 168 /
      // small_fleet 240 / medium_fleet 360 / large_fleet 480 /
      // national_iot_backbone 720). SLA breach crosses regulator on
      // heavy tiers only (large_fleet + national_iot_backbone) under
      // NERSA Grid Code C-3 + IEC 62443 + SARB BA 700.
      await safe('mqtt_opcua_connector_sla_sweep', async () => {
        const result = await mqttOpcuaConnectorSlaSweep(env as never);
        console.log('mqtt_opcua_connector_sla_sweep', JSON.stringify(result));
      });
      // W124 STRATE / SWIFT settlement connector — 15-min sweep over
      // every active connector. INVERTED HOUR polarity (domestic_eft 168
      // / multi_bank_eft 240 / strate_csd 360 / samos_rtgs 480 /
      // swift_global 720). SLA breach crosses regulator on heavy tiers
      // (samos_rtgs + swift_global) under SARB ExCon + FIC Act +
      // Basel III + CPMI-IOSCO PFMI Principle 9.
      await safe('strate_swift_connector_sla_sweep', async () => {
        const result = await strateSwiftConnectorSlaSweep(env as never);
        console.log('strate_swift_connector_sla_sweep', JSON.stringify(result));
      });
      // W125 SAP / Oracle ERP connector — 15-min sweep over every
      // active connector. INVERTED HOUR polarity (single_module 168
      // / multi_module 240 / enterprise_wide 360 / group_consolidation
      // 480 / multi_country 720). SLA breach crosses regulator on
      // heavy tiers (enterprise_wide + group_consolidation +
      // multi_country) under SARS + CIPC + SOC 1 Type II + ISO 27001
      // + PCAOB AS 5.
      await safe('sap_oracle_erp_connector_sla_sweep', async () => {
        const result = await sapOracleErpConnectorSlaSweep(env as never);
        console.log('sap_oracle_erp_connector_sla_sweep', JSON.stringify(result));
      });
      // W126 CIPC / SARS / NERSA government-filing connector — 15-min
      // sweep over every active connector. INVERTED HOUR polarity
      // (single_filing 168 / quarterly_returns 240 / annual_returns 360
      // / multi_jurisdiction 480 / systemic_critical 720). SLA breach
      // crosses regulator on heavy tiers (multi_jurisdiction +
      // systemic_critical) under Companies Act + Tax Admin Act + ERA
      // s.10 + PAIA s.18.
      await safe('government_filing_connector_sla_sweep', async () => {
        const result = await governmentFilingConnectorSlaSweep(env as never);
        console.log('government_filing_connector_sla_sweep', JSON.stringify(result));
      });
      // W127 Anomaly-Detection ML Model — 15-min sweep over every
      // model lifecycle state with an SLA anchor. INVERTED HOUR
      // polarity (single_asset 24 / small_fleet 96 / large_fleet
      // 240 / multi_jurisdiction_fleet 480 / fleet_systemic 720).
      // SLA breach crosses regulator on heavy tiers
      // (multi_jurisdiction_fleet + fleet_systemic) under ISO 42001
      // + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II +
      // NERC CIP-013. FIRST Phase-D ML governance hard line.
      await safe('anomaly_detection_ml_sla_sweep', async () => {
        const result = await anomalyDetectionMlSlaSweep(env as never);
        console.log('anomaly_detection_ml_sla_sweep', JSON.stringify(result));
      });
      // W128 RUL Prediction ML Model — 15-min sweep over every
      // survival model lifecycle state with an SLA anchor. INVERTED
      // HOUR polarity (single_asset 24 / small_fleet 120 /
      // large_fleet 360 / multi_jurisdiction_fleet 600 /
      // fleet_systemic 720). LONGER shadow_deployed (72-1080h) than
      // W127 - survival models need censored-event maturation.
      // SLA breach crosses regulator on heavy tiers under ISO 42001
      // + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2 Type II +
      // NERC CIP-013. SECOND Phase-D ML governance hard line.
      await safe('rul_prediction_ml_sla_sweep', async () => {
        const result = await rulPredictionMlSlaSweep(env as never);
        console.log('rul_prediction_ml_sla_sweep', JSON.stringify(result));
      });
      // W129 Fault-Fingerprint Multi-Class ML Model — 15-min sweep
      // over every multi-class classifier lifecycle state with an SLA
      // anchor. INVERTED HOUR polarity (single_asset 36 / small_fleet
      // 120 / large_fleet 300 / multi_jurisdiction_fleet 600 /
      // fleet_systemic 900). LONGER than W128 — multi-class
      // confusion-matrix stabilisation + per-class calibration need
      // more shadow time on imbalanced classes. SLA breach crosses
      // regulator on heavy tiers under ISO 42001 + NIST AI RMF + EU
      // AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013. THIRD
      // Phase-D ML governance hard line.
      await safe('fault_fingerprint_ml_sla_sweep', async () => {
        const result = await faultFingerprintMlSlaSweep(env as never);
        console.log('fault_fingerprint_ml_sla_sweep', JSON.stringify(result));
      });
      // W130 NTT Comparison Battery — 15-min sweep over every comparison-
      // cycle lifecycle state with an SLA anchor. INVERTED HOUR polarity
      // (single_asset 12 / small_fleet 48 / large_fleet 120 /
      // multi_jurisdiction_fleet 240 / fleet_systemic 480). TIGHTER than
      // W127-W129 because cycles run nightly. SLA breach crosses regulator
      // on heavy tiers under ISO 42001 + NIST AI RMF + SARB MA s38 + IFRS.
      // FOURTH (final) Phase-D ML governance hard line. CLOSES PHASE D.
      await safe('ntt_comparison_battery_sla_sweep', async () => {
        const result = await nttComparisonBatterySlaSweep(env as never);
        console.log('ntt_comparison_battery_sla_sweep', JSON.stringify(result));
      });
      // W131 Stage Gates — 15-min SLA sweep over every non-terminal gate
      // with a sla_deadline_at in the past. INVERTED polarity:
      // low_capex 168h / medium_capex 336h / high_capex 720h /
      // mega_capex 1440h / equator_cat_a 2160h. SLA breach crosses
      // regulator on high_capex + mega_capex + equator_cat_a.
      // SIGNATURE: reject_gate crosses EVERY tier. PHASE E W1.
      await safe('stage_gate_sla_sweep', async () => {
        const result = await stageGateSlaSweep(env as never);
        console.log('stage_gate_sla_sweep', JSON.stringify(result));
      });
      // W132 IPP Issues: URGENT SLA (P1 critical = 24h tightest).
      // P1+P2 safety/regulatory breaches cross regulator (OHSA s24 + ERA s35).
      await safe('ipp_issue_sla_sweep', async () => {
        const result = await ippIssueSlaSweep(env as never);
        console.log('ipp_issue_sla_sweep', JSON.stringify(result));
      });
      // W133 IPP Risk Register: INVERTED SLA (catastrophic 2160h most time).
      // Critical/catastrophic safety/regulatory SLA breaches cross regulator.
      await safe('ipp_risk_sla_sweep', async () => {
        const result = await ippRiskSlaSweep(env as never);
        console.log('ipp_risk_sla_sweep', JSON.stringify(result));
      });
      // W134 IPP Stakeholder Register: URGENT SLA (strategic_ally 24h tightest).
      // NERSA-required strategic_ally/key_player SLA breaches cross regulator.
      await safe('ipp_stakeholder_sla_sweep', async () => {
        const result = await ippStakeholderSlaSweep(env as never);
        console.log('ipp_stakeholder_sla_sweep', JSON.stringify(result));
      });
      // W135 — IPP Lessons Learned SLA sweep (INVERTED: critical_impact 720h MOST time).
      // SIGNATURE: safety lessons + floor_safety_critical critical/high cross regulator.
      await safe('ipp_lessons_learned_sla_sweep', async () => {
        const result = await ippLessonsLearnedSlaSweep(env as never);
        console.log('ipp_lessons_learned_sla_sweep', JSON.stringify(result));
      });
      // W136 — IPP NCR SLA sweep (URGENT: safety_critical 24h TIGHTEST).
      // SIGNATURE: floor_safety_stop_work always crosses; floor_hold_point + safety_critical/structural crosses.
      await safe('ipp_ncr_sla_sweep', async () => {
        const result = await ippNcrSlaSweep(env as never);
        console.log('ipp_ncr_sla_sweep', JSON.stringify(result));
      });
      // W137 — IPP Method Statement SLA sweep (URGENT: high_risk 24h TIGHTEST).
      // SIGNATURE: high_risk + critical_lift/confined_space/live_electrical crosses regulator on breach.
      await safe('ipp_method_statement_sla_sweep', async () => {
        const result = await ippMethodStatementSlaSweep(env as never);
        console.log('ipp_method_statement_sla_sweep', JSON.stringify(result));
      });
      // W138 — IPP Environmental Monitoring SLA sweep (URGENT: critical 24h TIGHTEST).
      // SIGNATURE: critical + near_sensitive_receptor crosses; floor_eia_condition_breach crosses any tier.
      await safe('ipp_env_monitoring_sla_sweep', async () => {
        const result = await ippEnvMonitoringSlaSweep(env as never);
        console.log('ipp_env_monitoring_sla_sweep', JSON.stringify(result));
      });
      // W139 — IPP Material Inspection Record SLA sweep (URGENT: critical_structural 24h TIGHTEST).
      // SIGNATURE: critical_structural + ie_witnessed crosses; nersa_material + critical/electrical crosses.
      await safe('ipp_mir_sla_sweep', async () => {
        const result = await ippMirSlaSweep(env as never);
        console.log('ipp_mir_sla_sweep', JSON.stringify(result));
      });
      // W140 — IPP Subcontractor Management SLA sweep (URGENT: critical_trade 24h TIGHTEST).
      // SIGNATURE: critical_trade + ie_oversight crosses; floor_ohsa_notification crosses any tier.
      await safe('ipp_subcontractor_sla_sweep', async () => {
        const result = await ippSubcontractorSlaSweep(env as never);
        console.log('ipp_subcontractor_sla_sweep', JSON.stringify(result));
      });
      // W141 — IPP Progress Claims SLA sweep (INVERTED SLA: major 720h, minor 72h).
      // SIGNATURE: major+significant cross on SLA breach when floor_ie_milestone_payment.
      await safe('ipp_progress_claim_sla_sweep', async () => {
        const result = await ippProgressClaimSlaSweep(env as never);
        console.log('ipp_progress_claim_sla_sweep', JSON.stringify(result));
      });
      // W142 — IPP TQ Log SLA sweep (URGENT SLA: safety_critical 24h tightest).
      // Breaches on safety_critical+structural cross regulator; IE-notification+non-info also cross.
      await safe('ipp_tq_sla_sweep', async () => {
        const result = await ippTqSlaSweep(env as never);
        console.log('ipp_tq_sla_sweep', JSON.stringify(result));
      });
      // W143 — IPP Daily Construction Diary SLA sweep (URGENT SLA: critical_delay 12h tightest).
      // miss_diary EVERY tier (SIGNATURE); dispute_diary on delay+critical_delay; submit_diary on safety.
      await safe('ipp_diary_sla_sweep', async () => {
        const result = await ippDiarySlaSweep(env as never);
        console.log('ipp_diary_sla_sweep', JSON.stringify(result));
      });
      // W144 — IPP Site/Engineer's Instruction SLA sweep (URGENT SLA: safety_directive 4h tightest).
      // issue_instruction when safety_directive EVERY tier (OHSA s.8 SIGNATURE).
      await safe('ipp_site_instruction_sla_sweep', async () => {
        const result = await ippSiteInstructionSlaSweep(env as never);
        console.log('ipp_site_instruction_sla_sweep', JSON.stringify(result));
      });
      // W145 — IPP DLP Defects SLA sweep (URGENT SLA: critical 24h tightest).
      // ie_reject → escalated_to_ncr EVERY tier (SIGNATURE); SLA breach crosses on critical/structural/safety.
      await safe('ipp_dlp_defect_sla_sweep', async () => {
        const result = await ippDlpDefectSlaSweep(env as never);
        console.log('ipp_dlp_defect_sla_sweep', JSON.stringify(result));
      });
      // W146 — IPP Variation Order SLA sweep (INVERTED SLA: material 45d, minor 7d).
      // refer_adjudication crosses regulator EVERY tier (SIGNATURE).
      await safe('ipp_variation_order_sla_sweep', async () => {
        await ippVariationOrderSlaSweep(env as never);
      });
      // W147 — IPP Payment Certificate SLA sweep; also marks certified → lapsed.
      // refer_adjudication crosses EVERY tier; certify_final crosses major/material.
      await safe('ipp_payment_cert_sla_sweep', async () => {
        await ippPaymentCertSlaSweep(env as never);
      });
      // W148: issue_fcc crosses regulator EVERY tier (COD milestone); reject crosses major/material.
      await safe('ipp_final_completion_sla_sweep', async () => {
        await ippFinalCompletionSlaSweep(env as never);
      });
      // W149: accept_handover crosses EVERY tier (COD gate); reject crosses major/material.
      await safe('ipp_om_handover_sla_sweep', async () => {
        await ippOmHandoverSlaSweep(env as never);
      });
      // W150: lodge_deeds crosses EVERY tier; reject_survey crosses major/material.
      await safe('ipp_land_register_sla_sweep', async () => {
        await ippLandRegisterSlaSweep(env as never);
      });
      // W151: issue_closure_cert crosses EVERY tier; reject_application crosses major/material.
      await safe('ipp_env_closure_sla_sweep', async () => {
        await ippEnvClosureSlaSweep(env as never);
      });
      // W152: issue_performance_cert crosses EVERY tier; declare_test_failure crosses major/material.
      await safe('ipp_commissioning_test_sla_sweep', async () => {
        await ippCommissioningTestSlaSweep(env as never);
      });
      // W153: issue_cert crosses EVERY tier; reject_certification crosses major/material.
      await safe('ipp_ie_cert_sla_sweep', async () => {
        await ippIeCertSlaSweep(env as never);
      });
      // W154: sign_tpa_agreement crosses EVERY tier; reject_application crosses major/material.
      await safe('ipp_tpa_sla_sweep', async () => {
        await ippTpaSlaSweep(env as never);
      });
      // W155: approve_variation crosses EVERY tier; reject_variation + file_appeal cross major/material.
      await safe('ipp_ppavar_sla_sweep', async () => {
        await ippPpaVariationSlaSweep(env as never);
      });
      // W156: grant_approval crosses EVERY tier; reject_change + file_appeal cross major/material; impose_conditions crosses significant+.
      await safe('ipp_coc_sla_sweep', async () => {
        await ippChangeOfControlSlaSweep(env as never);
      });
      // W157: achieve_financial_close crosses EVERY tier; reject_refinancing crosses significant+; declare_lender_default crosses EVERY tier.
      await safe('ipp_refi_sla_sweep', async () => {
        await ippRefinancingSlaSweep(env as never);
      });
      // W158: grant_relief + declare_prolonged cross EVERY tier; dispute_claim crosses significant+.
      await safe('ipp_fm_sla_sweep', async () => {
        await ippFmSlaSweep(env as never);
      });
      // W159: reject_report + lodge_appeal + determine_appeal cross EVERY tier; accept_report crosses large+.
      await safe('ipp_anr_sla_sweep', async () => {
        await ippAnnualReportSlaSweep(env as never);
      });
      // W160: confirm_default + appoint_replacement cross EVERY tier; invoke_step_in_rights crosses major+.
      await safe('ipp_cd_sla_sweep', async () => {
        await ippContractorDefaultSlaSweep(env as never);
      });
      // W161: identify_non_compliance + refer_to_enforcement cross EVERY tier; certify_compliant crosses large+.
      await safe('ipp_eco_sla_sweep', async () => {
        await ippEcoReportSlaSweep(env as never);
      });
      // W162: refuse_certificate crosses significant+; approve_certificate crosses major+.
      await safe('ipp_lta_sla_sweep', async () => {
        await ippLtaCertificateSlaSweep(env as never);
      });
      // W163: refuse_amendment crosses EVERY tier; grant_amendment crosses major+.
      await safe('ipp_land_amendment_sla_sweep', async () => {
        await ippLandAmendmentSlaSweep(env as never);
      });
      // W164: reject_report crosses EVERY tier; accept_report crosses major+.
      await safe('ipp_community_trust_sla_sweep', async () => {
        await ippCommunityTrustSlaSweep(env as never);
      });
      // W165: issue_non_compliance crosses EVERY tier; certify_compliant crosses utility+.
      await safe('ipp_grid_compliance_sla_sweep', async () => {
        await ippGridComplianceSlaSweep(env as never);
      });
      // W166: reject_ccc + refer_to_nersa cross EVERY tier; agree_ccc crosses major+.
      await safe('ipp_ccc_sla_sweep', async () => {
        await ippCccSlaSweep(env as never);
      });
      // W167: declare_renewal_failed crosses EVERY tier; execute_novation crosses significant+.
      await safe('ipp_om_contract_sla_sweep', async () => {
        await ippOmContractSlaSweep(env as never);
      });
      // W168: reject_bfs crosses EVERY tier; certify_bfs crosses utility+.
      await safe('ipp_bfs_sla_sweep', async () => {
        await ippBfsSlaSweep(env as never);
      });
      // W169: refuse_amendment + refer_s24g cross EVERY tier; grant_amendment crosses utility+.
      await safe('ipp_ea_amendment_sla_sweep', async () => {
        await ippEaAmendmentSlaSweep(env as never);
      });
      // W170: refuse_wul crosses EVERY tier; lapse_wul + grant_wul cross utility+.
      await safe('ipp_wul_sla_sweep', async () => {
        await ippWulSlaSweep(env as never);
      });
      // W171: refuse_hra crosses EVERY tier; add_to_watchlist + approve_hra cross utility+.
      await safe('ipp_hra_sla_sweep', async () => {
        await ippHraSlaSweep(env as never);
      });
      // W172: refuse_ael crosses EVERY tier; lapse_ael + grant_ael cross utility+.
      await safe('ipp_ael_sla_sweep', async () => {
        await ippAelSlaSweep(env as never);
      });
      // W173: declare_arbitration + refuse_relief cross EVERY tier; confirm_relief crosses major+.
      await safe('ipp_fmr_sla_sweep', async () => {
        await ippForceMajeureSlaSweep(env as never);
      });
      // W174: confirm_non_compliance crosses EVERY tier; conditional_compliance medium+.
      await safe('ipp_lcr_sla_sweep', async () => {
        await ippLcReportSlaSweep(env as never);
      });
      // W175: reject_milestone crosses ALL tiers; certify_milestone + lapse_milestone cross utility+.
      await safe('ipp_mc_sla_sweep', async () => {
        await ippMilestoneCertSlaSweep(env as never);
      });
      // W176: declare_material_breach crosses ALL tiers; withhold_certificate medium+.
      await safe('ipp_esmr_sla_sweep', async () => {
        await ippEsmrSlaSweep(env as never);
      });
      // W177: escalate_to_lenders crosses ALL tiers; require_remediation large+; close_review utility+.
      await safe('ipp_iear_sla_sweep', async () => {
        await ippIeAnnualReviewSlaSweep(env as never);
      });
      // W178: confirm_inadequate + lapse_coverage cross ALL tiers; confirm_adequate major+.
      await safe('ipp_insr_sla_sweep', async () => {
        await ippInsuranceRenewalSlaSweep(env as never);
      });
      // W179: reject_security + lapse_security cross ALL tiers; confirm_security large+.
      await safe('ipp_psec_sla_sweep', async () => {
        await ippPerfSecuritySlaSweep(env as never);
      });
      // W180: declare_non_compliant + lapse_cep cross ALL tiers; confirm_compliant major+.
      await safe('ipp_cep_sla_sweep', async () => {
        await ippCepComplianceSlaSweep(env as never);
      });
      // W181: declare_non_compliant + lapse_sed cross ALL tiers; confirm_compliant large+.
      await safe('ipp_sed_sla_sweep', async () => {
        await ippSedComplianceSlaSweep(env as never);
      });
      // W182: declare_non_compliant + lapse_certificate cross ALL tiers; confirm_verified majority+.
      await safe('ipp_bbbee_sla_sweep', async () => {
        await ippBbbeeVerificationSlaSweep(env as never);
      });
      // W183: declare_covenant_breach cross ALL tiers; raise_dispute + confirm_acknowledged syndicated+.
      await safe('ipp_lrep_sla_sweep', async () => {
        await ippLenderReportingSlaSweep(env as never);
      });
      // W184: reject_return ALL tiers; declare_lapsed + request_clarification major+.
      await safe('ipp_anr_sla_sweep', async () => {
        await ippLicenceReturnSlaSweep(env as never);
      });
      // W185: reject_report ALL tiers; declare_lapsed + confirm_acknowledgement major+.
      await safe('ipp_rpr_sla_sweep', async () => {
        await ippReippppReportSlaSweep(env as never);
      });
      // W186: reject_transfer ALL tiers; complete_transfer + declare_lapsed large+.
      await safe('ipp_eqt_sla_sweep', async () => {
        await ippEquityTransferSlaSweep(env as never);
      });
      // W187: reject_report ALL tiers; declare_lapsed + confirm_acknowledgement major+.
      await safe('ipp_qgr_sla_sweep', async () => {
        await ippQuarterlyGenReportSlaSweep(env as never);
      });
      // W188: issue_deficiency_notice ALL tiers; declare_lapsed + accept_assessment major+.
      await safe('ipp_acs_sla_sweep', async () => {
        await ippAnnualComplianceAssessmentSlaSweep(env as never);
      });
      // W189: issue_qualified_opinion ALL tiers; declare_lapsed + complete_audit major+.
      await safe('ipp_aud_sla_sweep', async () => {
        await ippAnnualAuditSlaSweep(env as never);
      });
      // W190: reject_report ALL tiers; declare_lapsed + accept_report major+.
      await safe('ipp_empr_sla_sweep', async () => {
        await ippEmpComplianceReportSlaSweep(env as never);
      });
      // W192: IPP CP tracker SLA sweep.
      await safe('ipp_cp_tracker_sla_sweep', async () => {
        const result = await ippCpTrackerSlaSweep(env as never);
        console.log('ipp_cp_tracker_sla_sweep', JSON.stringify(result));
      });
      // W193: IPP licence obligation SLA sweep.
      await safe('ipp_licence_obligation_sla_sweep', async () => {
        const result = await ippLicenceObligationSlaSweep(env as never);
        console.log('ipp_licence_obligation_sla_sweep', JSON.stringify(result));
      });
      // W194: Facility Amendment & Consent — INVERTED SLA sweep.
      await safe('facility_amendment_sla_sweep', async () => {
        const result = await facilityAmendmentSlaSweep(env as never);
        console.log('facility_amendment_sla_sweep', JSON.stringify(result));
      });
      // W195: ESAP Compliance Monitoring — INVERTED SLA sweep.
      await safe('esap_compliance_sla_sweep', async () => {
        const result = await esapComplianceSlaSweep(env as never);
        console.log('esap_compliance_sla_sweep', JSON.stringify(result));
      });
      // W196: Grid Protection Relay & Anti-Islanding — URGENT SLA sweep.
      await safe('protection_relay_sla_sweep', async () => {
        const result = await protectionRelaySlaSweep(env as never);
        console.log('protection_relay_sla_sweep', JSON.stringify(result));
      });
      // W197: Offtaker Unserved Energy Compensation Claim — URGENT SLA sweep.
      await safe('unserved_energy_sla_sweep', async () => {
        const result = await unservedEnergySlaSweep(env as never);
        console.log('unserved_energy_sla_sweep', JSON.stringify(result));
      });
      // W191: station participant link SLA — expire unactioned proposals.
      await safe('station_link_sla_sweep', async () => {
        await stationParticipantLinkSlaSweep(env as never);
      });
      // W198: KYC/FICA Verification — INVERTED SLA sweep.
      await safe('kyc_sla_sweep', async () => {
        const result = await kycSlaSweep(env as never);
        console.log('kyc_sla_sweep', JSON.stringify(result));
      });
      // W199: Smart Meter Asset Commissioning — URGENT SLA sweep.
      await safe('sma_sla_sweep', async () => {
        const result = await smaSlaSweep(env as never);
        console.log('sma_sla_sweep', JSON.stringify(result));
      });
      // W200: Carbon Tax Return & SARS Filing — INVERTED SLA sweep.
      await safe('ctr_sla_sweep', async () => {
        const result = await ctrSlaSweep(env as never);
        console.log('ctr_sla_sweep', JSON.stringify(result));
      });
      // W201: FSCA Annual Compliance Certificate — INVERTED SLA sweep.
      await safe('fscc_sla_sweep', async () => {
        const result = await fsccSlaSweep(env as never);
        console.log('fscc_sla_sweep', JSON.stringify(result));
      });
      // W202: Green Bond Allocation & Climate Finance Report — INVERTED SLA sweep.
      await safe('gbr_sla_sweep', async () => {
        const result = await gbrSlaSweep(env as never);
        console.log('gbr_sla_sweep', JSON.stringify(result));
      });
      // W203: Basel III Regulatory Capital & RWA Adequacy Report — INVERTED SLA sweep.
      await safe('cap_adequacy_sla_sweep', async () => {
        const result = await capSlaSweep(env as never);
        console.log('cap_adequacy_sla_sweep', JSON.stringify(result));
      });
      // W204: SLB KPI & Sustainability-Linked PPA Ratchet — INVERTED SLA sweep.
      await safe('slb_kpi_sla_sweep', async () => {
        const result = await slbSlaSweep(env as never);
        console.log('slb_kpi_sla_sweep', JSON.stringify(result));
      });
      // W205: Grid Demand-Response Programme Participation & Settlement — URGENT SLA sweep.
      await safe('dr_sla_sweep', async () => {
        const result = await drSlaSweep(env as never);
        console.log('dr_sla_sweep', JSON.stringify(result));
      });
      // W206: Carbon Registry Transfer & International Registry Notification — INVERTED SLA sweep.
      await safe('crt_sla_sweep', async () => {
        const result = await crtSlaSweep(env as never);
        console.log('crt_sla_sweep', JSON.stringify(result));
      });
      // W207: IPP Milestone & Schedule Variance Report — INVERTED SLA sweep.
      await safe('mvs_sla_sweep', async () => {
        const result = await mvsSlaSweep(env as never);
        console.log('mvs_sla_sweep', JSON.stringify(result));
      });
      // W208: Support SLA Escalation & CSAT Lifecycle — URGENT SLA sweep.
      await safe('csat_sla_sweep', async () => {
        const result = await csatSlaSweep(env as never);
        console.log('csat_sla_sweep', JSON.stringify(result));
      });
      // W209: Regulator Public Consultation — INVERTED SLA sweep.
      await safe('pc_sla_sweep', async () => {
        const result = await pcSlaSweep(env as never);
        console.log('pc_sla_sweep', JSON.stringify(result));
      });
      // W210: Offtaker Green Tariff / PPA Labelling — INVERTED SLA sweep.
      await safe('gt_sla_sweep', async () => {
        const result = await gtSlaSweep(env as never);
        console.log('gt_sla_sweep', JSON.stringify(result));
      });
      // W211: Grid Substation Asset Lifecycle — INVERTED SLA sweep.
      await safe('sas_sla_sweep', async () => {
        const result = await sasSlaSweep(env as never);
        console.log('sas_sla_sweep', JSON.stringify(result));
      });
      // W212: IPP DSCR Report — INVERTED SLA sweep.
      await safe('dscr_sla_sweep', async () => {
        const result = await dscrSlaSweep(env as never);
        console.log('dscr_sla_sweep', JSON.stringify(result));
      });
      // W213: Carbon Methodology Amendment — INVERTED SLA sweep.
      await safe('ma_sla_sweep', async () => {
        const result = await maSlaSweep(env as never);
        console.log('ma_sla_sweep', JSON.stringify(result));
      });
      // W214: Lender ESAP Monitoring — INVERTED SLA sweep.
      await safe('esap_sla_sweep', async () => {
        const result = await esapSlaSweep(env as never);
        console.log('esap_sla_sweep', JSON.stringify(result));
      });
      // W215: Grid EOP Activation & Post-Event Review — URGENT SLA sweep.
      await safe('eop_sla_sweep', async () => {
        const result = await eopSlaSweep(env as never);
        console.log('eop_sla_sweep', JSON.stringify(result));
      });
      // W216: Trader FSCA Conduct Report — INVERTED SLA sweep.
      await safe('fcr_sla_sweep', async () => {
        const result = await fcrSlaSweep(env as never);
        console.log('fcr_sla_sweep', JSON.stringify(result));
      });
      // W217: Support SLA Performance Report — INVERTED SLA sweep.
      await safe('spr_sla_sweep', async () => {
        const result = await sprSlaSweep(env as never);
        console.log('spr_sla_sweep', JSON.stringify(result));
      });
      // W218: IPP Credit Insurance — INVERTED SLA sweep.
      await safe('ci_sla_sweep', async () => {
        const result = await ciSlaSweep(env as never);
        console.log('ci_sla_sweep', JSON.stringify(result));
      });
      // W219: Offtaker Wheeling Access — INVERTED SLA sweep.
      await safe('wheel_sla_sweep', async () => {
        const result = await wheelSlaSweep(env as never);
        console.log('wheel_sla_sweep', JSON.stringify(result));
      });
      // W220: Regulator Market Conduct Examination — INVERTED SLA sweep.
      await safe('mce_sla_sweep', async () => {
        const result = await mceSlaSweep(env as never);
        console.log('mce_sla_sweep', JSON.stringify(result));
      });
      // W221: Esums Export Curtailment — MIXED SLA sweep.
      await safe('ec_sla_sweep', async () => {
        const result = await ecSlaSweep(env as never);
        console.log('ec_sla_sweep', JSON.stringify(result));
      });
      // W222: Trader Cross-Border Trade — INVERTED SLA sweep.
      await safe('cbt_sla_sweep', async () => {
        const result = await cbtSlaSweep(env as never);
        console.log('cbt_sla_sweep', JSON.stringify(result));
      });
      // W223: Lender CP Clearance — INVERTED SLA sweep.
      await safe('cp_sla_sweep', async () => {
        const result = await cpSlaSweep(env as never);
        console.log('cp_sla_sweep', JSON.stringify(result));
      });
      // W224: IPP GTIA — INVERTED SLA sweep.
      await safe('gtia_sla_sweep', async () => {
        const result = await gtiaSlaSweep(env as never);
        console.log('gtia_sla_sweep', JSON.stringify(result));
      });
      // W225: Carbon Scope 3 Disclosure — INVERTED SLA sweep.
      await safe('s3_sla_sweep', async () => {
        const result = await s3SlaSweep(env as never);
        console.log('s3_sla_sweep', JSON.stringify(result));
      });
      // W226: VCM Project Development — INVERTED SLA sweep.
      await safe('vcm_project_sla_sweep', async () => {
        const result = await vcmProjectSlaSweep(env as never);
        console.log('vcm_project_sla_sweep', JSON.stringify(result));
      });
      // W226: Carbon Budget Management & Carbon Tax Compliance — INVERTED SLA sweep.
      await safe('carbon_budget_sla_sweep', async () => {
        const result = await carbonBudgetSlaSweep(env as never);
        console.log('carbon_budget_sla_sweep', JSON.stringify(result));
      });
      // W226: REC device registration — INVERTED SLA sweep.
      await safe('rec_device_sla_sweep', async () => {
        const result = await recDeviceSlaSweep(env as never);
        console.log('rec_device_sla_sweep', JSON.stringify(result));
      });
      // W226: REC issuance requests — INVERTED SLA sweep.
      await safe('rec_issuance_sla_sweep', async () => {
        const result = await recIssuanceSlaSweep(env as never);
        console.log('rec_issuance_sla_sweep', JSON.stringify(result));
      });
      // W226: Certificate bundles — INVERTED SLA sweep.
      await safe('cert_bundle_sla_sweep', async () => {
        const result = await certBundleSlaSweep(env as never);
        console.log('cert_bundle_sla_sweep', JSON.stringify(result));
      });
      // W227: Sustainability marketplace listings — expire + SLA sweep.
      await safe('sustainability_marketplace_sla_sweep', async () => {
        const result = await listingSlaSweep(env as never);
        console.log('sustainability_marketplace_sla_sweep', JSON.stringify(result));
      });
      // W227: Sustainability marketplace transactions — SLA breach sweep.
      await safe('sustainability_transaction_sla_sweep', async () => {
        const result = await transactionSlaSweep(env as never);
        console.log('sustainability_transaction_sla_sweep', JSON.stringify(result));
      });
      // Block trades — flip to 'published' once publication_delay has elapsed
      // so the market can see the print.
      await safe('block_trade_publish', async () => {
        await env.DB.prepare(`
          UPDATE oe_block_trades
          SET status = 'published', published_at = datetime('now')
          WHERE status = 'confirmed'
            AND datetime(trade_time, '+' || COALESCE(publication_delay_minutes,15) || ' minutes') <= datetime('now')
        `).run().catch(() => null);
      });
      // Auctions — close past their end_at and lock the winning bid.
      await safe('auction_close', async () => {
        await env.DB.prepare(`
          UPDATE oe_auctions SET status = 'closed', closed_at = datetime('now')
          WHERE status = 'open' AND end_at <= datetime('now')
        `).run().catch(() => null);
      });
      // RFQs — close past their close_at so quotes can be evaluated.
      await safe('rfq_close', async () => {
        await env.DB.prepare(`
          UPDATE oe_rfqs SET status = 'evaluating'
          WHERE status = 'open' AND close_at <= datetime('now')
        `).run().catch(() => null);
      });
      // Wave 3 — settlement-fail SLA escalation sweep.
      // Tier 1: failed instruction >15 min old, no prior escalation → tier 1.
      // Tier 2: failed instruction >2 hr old + at tier 1 → tier 2 (ops_call).
      // Tier 3: failed instruction >4 hr old + at tier 2 → tier 3 (buy_in_initiated).
      // Tier 4 (default_event) is operator-driven, not automatic.
      await safe('settlement_fail_sla_sweep', async () => {
        const inst = await env.DB.prepare(`
          SELECT id, member_id,
                 (julianday('now') - julianday(updated_at)) * 24 * 60 AS age_min
            FROM oe_settlement_instructions
           WHERE status = 'failed'
             AND (julianday('now') - julianday(updated_at)) * 24 * 60 >= 15
        `).all<any>().catch(() => ({ results: [] as any[] }));
        for (const i of (inst.results || []) as any[]) {
          const prior = await env.DB.prepare(`
            SELECT MAX(escalation_tier) AS tier FROM settlement_fail_escalations
             WHERE instruction_id = ? AND resolution_status = 'open'
          `).bind(i.id).first<any>().catch(() => null);
          const priorTier = Number(prior?.tier || 0);
          let next = priorTier;
          if (priorTier === 0 && i.age_min >= 15) next = 1;
          else if (priorTier === 1 && i.age_min >= 120) next = 2;
          else if (priorTier === 2 && i.age_min >= 240) next = 3;
          if (next === priorTier) continue;
          const id = `sfe_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          await env.DB.prepare(`
            INSERT INTO settlement_fail_escalations (id, instruction_id, escalation_tier, triggered_by)
            VALUES (?,?,?,?)
          `).bind(id, i.id, next, 'cron_sla_sweep').run().catch(() => null);
          await fireCascade({
            event: 'settlement.fail.escalated',
            actor_id: 'system',
            entity_type: 'settlement_instruction',
            entity_id: i.id,
            data: { escalation_tier: next, age_min: Math.round(i.age_min) },
            env,
          });
        }
      });
      // Wave 5 — regulator inbox SLA escalation sweep. Any pending row whose
      // sla_due_at has passed is auto-escalated. Optionally opens an
      // enforcement case if a matching escalation_rule with on_breach='open_case'
      // applies. Rule matching is a simple substring match on source_event
      // (e.g. 'carbon.article6.*' matches any article6 event) plus severity
      // gate.
      await safe('regulator_inbox_sla_sweep', async () => {
        const overdue = await env.DB.prepare(`
          SELECT id, source_event, severity, title, source_entity_id
            FROM oe_regulator_inbox
           WHERE ack_status = 'pending'
             AND sla_due_at IS NOT NULL
             AND sla_due_at <= datetime('now')
           LIMIT 100
        `).all<any>().catch(() => ({ results: [] as any[] }));
        const rules = await env.DB.prepare(`
          SELECT rule_code, event_pattern, severity_min, on_breach, enabled
            FROM oe_regulator_escalation_rules
           WHERE enabled = 1
        `).all<any>().catch(() => ({ results: [] as any[] }));
        const sevRank: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
        const matches = (evt: string, pat: string) => {
          if (pat === '*' || pat === evt) return true;
          if (pat.endsWith('*')) return evt.startsWith(pat.slice(0, -1));
          return false;
        };
        const ts = new Date().toISOString();
        for (const r of (overdue.results || []) as any[]) {
          let onBreach: 'escalate' | 'open_case' | 'notify_only' = 'escalate';
          for (const rule of (rules.results || []) as any[]) {
            if (!matches(r.source_event, rule.event_pattern)) continue;
            if ((sevRank[r.severity] ?? 0) < (sevRank[rule.severity_min] ?? 0)) continue;
            onBreach = rule.on_breach;
            break;
          }
          if (onBreach === 'notify_only') {
            await env.DB.prepare(`
              UPDATE oe_regulator_inbox SET updated_at = ? WHERE id = ?
            `).bind(ts, r.id).run().catch(() => null);
            continue;
          }
          let caseId: string | null = null;
          if (onBreach === 'open_case') {
            caseId = `rec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            await env.DB.prepare(`
              INSERT INTO regulator_enforcement_cases
                (id, subject_user_id, case_type, severity, opened_by, opened_at,
                 status, source_alert_id, summary, created_at, updated_at)
              VALUES (?, '', 'sla_auto_escalation', ?, 'system', ?, 'open', ?, ?, ?, ?)
            `).bind(caseId, r.severity, ts, r.source_entity_id, r.title, ts, ts)
              .run().catch(() => { caseId = null; });
          }
          await env.DB.prepare(`
            UPDATE oe_regulator_inbox
               SET ack_status = 'escalated', escalated_at = ?,
                   escalated_to_case = ?, ack_note = 'auto-escalation (SLA breach)',
                   updated_at = ?
             WHERE id = ?
          `).bind(ts, caseId, ts, r.id).run().catch(() => null);
          await fireCascade({
            event: 'regulator.surveillance_escalated',
            actor_id: 'system',
            entity_type: 'oe_regulator_inbox',
            entity_id: r.id,
            data: { reason: 'sla_breach', case_id: caseId, severity: r.severity, source_event: r.source_event },
            env,
          });
        }
      });
      // Wave 5 — compliance notices overdue flag. Notices whose remedy
      // deadline has passed and which are not yet satisfied/withdrawn get
      // flipped to 'overdue' so the licensee + regulator surface escalates.
      await safe('compliance_notices_overdue', async () => {
        await env.DB.prepare(`
          UPDATE oe_compliance_notices
             SET status = 'overdue',
                 overdue_flagged_at = COALESCE(overdue_flagged_at, datetime('now')),
                 updated_at = datetime('now')
           WHERE status IN ('issued','acknowledged')
             AND remedy_deadline_at IS NOT NULL
             AND remedy_deadline_at <= datetime('now')
        `).run().catch(() => null);
      });
      // Wave 6 — lender dunning escalation sweep.
      //
      // Two passes:
      //   1. Flag pending dunning notices past their cure_deadline_at
      //      as 'overdue' (audit-friendly state change).
      //   2. For each overdue notice, either issue the next cycle
      //      (1→2 or 2→3) or — when cycle 3 expires — fire
      //      `lender.watchlist_critical_escalation` so the row crosses
      //      into the Wave 5 regulator inbox.
      await safe('lender_dunning_overdue_sweep', async () => {
        // Mark anything past deadline as overdue.
        await env.DB.prepare(`
          UPDATE oe_lender_dunning_notices
             SET status = 'overdue',
                 overdue_flagged_at = COALESCE(overdue_flagged_at, datetime('now')),
                 updated_at = datetime('now')
           WHERE status = 'issued'
             AND cure_deadline_at <= datetime('now')
        `).run().catch(() => null);

        // Process overdue notices whose `escalated_at` has not been set yet.
        const overdueRows = await env.DB.prepare(`
          SELECT id, watchlist_id, facility_id, borrower_id, cycle, trigger_signal, title
            FROM oe_lender_dunning_notices
           WHERE status = 'overdue' AND escalated_at IS NULL
           LIMIT 50
        `).all<any>();

        const { nextDunningCycle } = await import('./utils/lender-escalation-spec');
        const { fireCascade } = await import('./utils/cascade');
        const now = new Date();
        for (const row of overdueRows.results || []) {
          const next = nextDunningCycle(Number(row.cycle), now);
          await env.DB.prepare(`
            UPDATE oe_lender_dunning_notices
               SET escalated_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ?
          `).bind(row.id).run().catch(() => null);

          if (next.terminal) {
            // Cycle 3 expired → escalate to regulator inbox.
            await env.DB.prepare(`
              INSERT INTO oe_lender_watchlist_events
                (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
              VALUES (?, ?, 'tier_escalated', ?, ?, 'system', ?, datetime('now'))
            `).bind(
              'we_' + Math.random().toString(36).slice(2, 10),
              row.watchlist_id, 3, 3,
              `Cycle 3 expired — regulator escalation`,
            ).run().catch(() => null);
            await fireCascade({
              event: 'lender.watchlist_critical_escalation',
              actor_id: 'system',
              entity_type: 'lender_watchlist',
              entity_id: String(row.watchlist_id || row.id),
              data: {
                watchlist_id: row.watchlist_id,
                facility_id: row.facility_id,
                borrower_id: row.borrower_id,
                trigger_signal: row.trigger_signal,
                last_notice_id: row.id,
                last_notice_title: row.title,
              },
              env,
            }).catch((e: unknown) => console.warn('lender_critical_escalation_failed', String(e)));
          } else {
            // Issue next cycle notice + bump watchlist tier.
            const newNoticeId = 'dun_' + Math.random().toString(36).slice(2, 10);
            await env.DB.prepare(`
              INSERT INTO oe_lender_dunning_notices
                (id, watchlist_id, facility_id, borrower_id, cycle, trigger_signal,
                 title, body_json, status, issued_at, issued_by, cure_deadline_at,
                 parent_notice_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued', datetime('now'), 'system', ?, ?)
            `).bind(
              newNoticeId, row.watchlist_id, row.facility_id, row.borrower_id,
              next.cycle, row.trigger_signal,
              `Cycle ${next.cycle} notice — prior cycle ${row.cycle} overdue`,
              JSON.stringify({ parent: row.id, cure_days: next.cure_days }),
              next.cure_deadline_at, row.id,
            ).run().catch(() => null);

            await env.DB.prepare(`
              UPDATE oe_lender_watchlist
                 SET watchlist_tier = MAX(watchlist_tier, ?),
                     dunning_cycle = ?,
                     auto_escalated_at = datetime('now'),
                     cure_deadline_at = ?
               WHERE id = ?
            `).bind(next.tier, next.cycle, next.cure_deadline_at, row.watchlist_id)
              .run().catch(() => null);

            await env.DB.prepare(`
              INSERT INTO oe_lender_watchlist_events
                (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
              VALUES (?, ?, 'dunning_issued', ?, ?, 'system', ?, datetime('now'))
            `).bind(
              'we_' + Math.random().toString(36).slice(2, 10),
              row.watchlist_id, next.tier, next.tier,
              `Cycle ${next.cycle} notice ${newNoticeId} issued automatically`,
            ).run().catch(() => null);
          }
        }
      });
      // Curtailment events — mark as 'completed' past their end_at.
      await safe('curtailment_complete', async () => {
        await env.DB.prepare(`
          UPDATE oe_curtailment_events SET status = 'completed'
          WHERE status IN ('active','accepted') AND end_at <= datetime('now')
        `).run().catch(() => null);
      });
      // Tariff hearings — auto-transition scheduled→in_session once
      // scheduled_for has passed (operator still has to record the outcome).
      await safe('hearing_start', async () => {
        await env.DB.prepare(`
          UPDATE oe_hearings SET status = 'in_session'
          WHERE status = 'scheduled' AND scheduled_for <= datetime('now')
            AND (concluded_at IS NULL)
        `).run().catch(() => null);
      });
      // Order-book depth snapshot — hit every shard that had a fill in the last hour.
      await safe('depth_snapshot', async () => {
        const shards = await env.DB.prepare(
          `SELECT DISTINCT shard_key FROM trade_fills WHERE executed_at >= datetime('now','-1 hour')`,
        ).all<{ shard_key: string }>();
        for (const s of shards.results || []) {
          const doNs = (env as unknown as { ORDER_BOOK?: DurableObjectNamespace }).ORDER_BOOK;
          if (!doNs) break;
          const id = doNs.idFromName(s.shard_key);
          await doNs.get(id).fetch('https://order-book/snapshot', { method: 'POST' });
        }
      });
      // Esums: roll the live revenue impact ticker on open faults.
      await safe('om_fault_tick', async () => {
        await env.DB.prepare(`
          UPDATE om_faults
          SET total_loss_zar = MAX(total_loss_zar,
                CAST(((julianday('now') - julianday(detected_at)) * 24 * hourly_loss_zar) AS INTEGER)),
              updated_at = datetime('now')
          WHERE status IN ('open','acknowledged','in_progress')
        `).run();
      });
      // Esums: deterministic fault engine — scan last 60 min of telemetry
      // and open new faults where rule conditions trip. Idempotent against
      // existing open faults of the same (device_id, fault_code).
      await safe('esums_fault_engine', async () => {
        await runFaultEngine(env, { windowMinutes: 60 });
      });
      // Esums: flag SLA-breached work orders.
      await safe('om_sla_check', async () => {
        await env.DB.prepare(`
          UPDATE om_work_orders SET sla_breached = 1
          WHERE sla_deadline < datetime('now')
            AND status NOT IN ('completed','verified','closed','cancelled')
            AND (sla_breached IS NULL OR sla_breached = 0)
        `).run();
      });
      // Status page: ingest a per-minute SLO sample.
      await safe('status_slo_ingest', async () => {
        const t0 = Date.now();
        await env.DB.prepare(`SELECT 1`).first();
        const dbMs = Date.now() - t0;
        const minute = new Date(); minute.setSeconds(0, 0);
        const ts = minute.toISOString();
        await env.DB.prepare(`
          INSERT OR REPLACE INTO oe_status_metrics (ts, metric, value) VALUES
            (?, 'd1_query_ms', ?),
            (?, 'up', 1)
        `).bind(ts, dbMs, ts).run();
      });
      // Daily uptime rollup for /status page — derive from yesterday's
      // status metrics + incidents. Per-component uptime % = 1 - (minutes
      // of major+critical incident impact / 1440).
      await safe('status_uptime_rollup', async () => {
        const components = ['API', 'Settlement', 'Trading', 'Webhooks', 'Esums'];
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const incs = await env.DB.prepare(`
          SELECT severity, affected_components, started_at, resolved_at
          FROM oe_status_incidents
          WHERE date(started_at) <= ? AND (resolved_at IS NULL OR date(resolved_at) >= ?)
            AND severity IN ('major','critical')
        `).bind(yesterday, yesterday).all<any>();
        const incRows = (incs.results || []) as any[];
        for (const comp of components) {
          let impactedMinutes = 0;
          let incidentCount = 0;
          for (const i of incRows) {
            const affected = JSON.parse(i.affected_components || '[]');
            if (!affected.includes(comp)) continue;
            incidentCount += 1;
            const dayStart = new Date(`${yesterday}T00:00:00Z`).getTime();
            const dayEnd = dayStart + 86_400_000;
            const istart = Math.max(dayStart, new Date(i.started_at).getTime());
            const iend = i.resolved_at ? Math.min(dayEnd, new Date(i.resolved_at).getTime()) : dayEnd;
            impactedMinutes += Math.max(0, (iend - istart) / 60_000);
          }
          const uptimePct = Math.max(0, Math.min(100, 100 - (impactedMinutes / 1440) * 100));
          await env.DB.prepare(`
            INSERT OR REPLACE INTO oe_status_uptime_daily (day, component, uptime_pct, incident_count)
            VALUES (?,?,?,?)
          `).bind(yesterday, comp, Math.round(uptimePct * 1000) / 1000, incidentCount).run();
        }
      });
      // POPIA SAR overdue alert — bump status for requests past their
      // 30-day statutory deadline.
      await safe('popia_sar_overdue', async () => {
        await env.DB.prepare(`
          UPDATE oe_popia_sar_requests SET status = 'escalated'
          WHERE due_at < datetime('now') AND status NOT IN ('fulfilled','rejected','escalated')
        `).run();
      });
      // POPIA: execute deletions whose 30-day cooling-off has elapsed.
      await safe('popia_deletion_executor', async () => {
        const due = await env.DB.prepare(`
          SELECT id, participant_id FROM oe_deletion_requests
          WHERE status = 'cooling_off' AND scheduled_for <= datetime('now') LIMIT 20
        `).all<{ id: string; participant_id: string }>();
        for (const r of (due.results || []) as Array<{ id: string; participant_id: string }>) {
          // Soft-delete: anonymise PII columns + revoke sessions. Hard-delete
          // would break audit chains.
          await env.DB.prepare(`UPDATE participants SET email = NULL, name = '[deleted]', phone = NULL, kyc_status = 'deleted' WHERE id = ?`).bind(r.participant_id).run().catch(() => null);
          await env.DB.prepare(`DELETE FROM sessions WHERE participant_id = ?`).bind(r.participant_id).run().catch(() => null);
          await env.DB.prepare(`UPDATE oe_deletion_requests SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).bind(r.id).run();
        }
      });
      // Esums: synthetic ingestion poll for enabled connections.
      // Batched INSERT per connection — one D1 round-trip instead of N.
      await safe('om_ingestion_poll', async () => {
        const conns = await env.DB.prepare(`
          SELECT id, site_id, polling_minutes, last_poll_at FROM om_connections
          WHERE enabled = 1
            AND (last_poll_at IS NULL
                 OR last_poll_at < datetime('now', '-' || polling_minutes || ' minutes'))
          LIMIT 50
        `).all<any>();
        const nowIso = new Date().toISOString();
        for (const conn of (conns.results || []) as any[]) {
          const devices = await env.DB.prepare(`SELECT id, rated_kw FROM om_devices WHERE site_id = ?`).bind(conn.site_id).all<any>();
          const rows = (devices.results || []) as any[];
          if (!rows.length) continue;
          // Build one multi-VALUES INSERT
          const valuesSql = rows.map(() => `(?,?,?,?,?,?,?)`).join(',');
          const binds: any[] = [];
          for (const d of rows) {
            const kw = Number(d.rated_kw || 100) * (0.4 + Math.random() * 0.4);
            binds.push(
              `omt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              d.id, conn.site_id, nowIso, kw, kw * 0.25, 'valid',
            );
          }
          await env.DB.prepare(`
            INSERT INTO om_telemetry (id, device_id, site_id, ts, ac_kw, interval_kwh, quality)
            VALUES ${valuesSql}
          `).bind(...binds).run();
          await env.DB.prepare(`UPDATE om_connections SET last_poll_at = ?, last_status = 'ok' WHERE id = ?`).bind(nowIso, conn.id).run();
        }
      });
      break;

    case '0 * * * *':
      // Hourly GoldRush accrual compute — carbon/revenue/savings per active station
      await safe('esums_accrual_compute', async () => {
        const activeStations = await env.DB
          .prepare("SELECT id FROM solax_stations WHERE status = 'active'")
          .all<{ id: string }>();
        const results = [];
        for (const st of activeStations.results ?? []) {
          try {
            const r = await computeStationAccruals(st.id, env as never);
            if (r.kwh_delta > 0) results.push({ id: st.id, ...r });
          } catch { /* per-station failures are non-fatal */ }
        }
        console.log('esums_accrual_compute', JSON.stringify({ stations: results.length }));
      });
      await safe('mark_price_vwap', async () => {
        // Trigger the same logic as POST /api/trader-risk/mark-prices/vwap-run.
        const types = await env.DB.prepare(
          `SELECT DISTINCT b.energy_type AS et, b.delivery_date AS dd
             FROM trade_fills f JOIN trade_orders b ON b.id = f.order_id
            WHERE f.executed_at LIKE ? || '%'`,
        ).bind(today).all<{ et: string; dd: string | null }>();
        for (const t of types.results || []) {
          const stat = await env.DB.prepare(
            `SELECT SUM(f.volume_mwh * f.price) AS gross, SUM(f.volume_mwh) AS vol
               FROM trade_fills f JOIN trade_orders b ON b.id = f.order_id
              WHERE b.energy_type = ? AND (b.delivery_date = ? OR (b.delivery_date IS NULL AND ? IS NULL))
                AND f.executed_at LIKE ? || '%'`,
          ).bind(t.et, t.dd, t.dd, today).first<{ gross: number; vol: number }>();
          if (!stat?.vol) continue;
          const vwap = stat.gross / stat.vol;
          await env.DB.prepare(
            `INSERT OR REPLACE INTO mark_prices (id, energy_type, delivery_date, mark_date, mark_price_zar_mwh, source)
             VALUES (?, ?, ?, ?, ?, 'vwap')`,
          ).bind(
            `mp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            t.et, t.dd, today, vwap,
          ).run();
        }
      });
      break;

    case '15 0 * * *':
      // Wave 112 — nightly IPP WBS & Gantt schedule-health recompute.
      // Walks every active oe_ipp_schedule row, recomputes CPI/SPI/SV/CV
      // + schedule_health_band from the latest EV/PV/AC +
      // critical_path_total_float_days, without a state transition. Keeps
      // the LIVE EVM battery accurate even on days nobody touched the row
      // (so dashboards, KPI strips and AI suggestions all reflect today's
      // truth at 00:15 UTC = 02:15 SAST every morning). Distinct from the
      // 15-min SLA sweep (which only flips sla_breached) — this is a pure
      // health-band recompute keyed off EVM inputs.
      await safe('ipp_schedule_health_recompute', async () => {
        const result = await ippScheduleHealthRecompute(env as never);
        console.log('ipp_schedule_health_recompute', JSON.stringify(result));
      });
      break;

    case '20 0 * * *':
      // Wave 113 — nightly IPP Cost & EVM health recompute.
      // Walks every active oe_ipp_evm row, recomputes the 12-field EVM
      // battery (CPI/SPI/CV/SV/EAC/ETC/VAC/TCPI + contingency/MR
      // remaining pct + evm_health_band + completeness_index) from the
      // latest PV/EV/AC + BAC + contingency/MR drawn — without a state
      // transition. Keeps the LIVE 22-field battery accurate even on
      // days nobody touched the row (so dashboards, KPI strips and AI
      // suggestions all reflect today's truth at 00:20 UTC = 02:20 SAST
      // every morning). Distinct from the 15-min SLA sweep (which only
      // flips sla_breached) — this is a pure EVM-input recompute.
      await safe('ipp_evm_health_recompute', async () => {
        const result = await ippEvmHealthRecompute(env as never);
        console.log('ipp_evm_health_recompute', JSON.stringify(result));
      });
      break;

    case '25 0 * * *':
      // Wave 114 — nightly IPP Document Control IDC matrix recompute.
      // Walks every active oe_ipp_document_control row, refreshes the
      // idc_status (open/review/approved/closed) from current
      // chain_status, recomputes the completeness index from the 12
      // forward timestamp markers + clean-archive bonus, and re-derives
      // the doc_health_band (green/amber/red/critical) — WITHOUT a state
      // transition. Document decisions are never moved by cron — only
      // the LIVE IDC matrix + completeness + health are refreshed so
      // dashboards, KPI strips and AI suggestions all reflect today's
      // truth at 00:25 UTC = 02:25 SAST every morning. Distinct from
      // the 15-min SLA sweep (which only flips sla_breached) — this is
      // a pure IDC-matrix + health-band refresh.
      await safe('ipp_doc_control_idc_matrix_recompute', async () => {
        const result = await ippDocControlIdcMatrixRecompute(env as never);
        console.log('ipp_doc_control_idc_matrix_recompute', JSON.stringify(result));
      });
      break;

    case '5 0 * * *':
      // Daily — publish a Merkle root over yesterday's audit_events for
      // every entity_type that had activity. Sealed with the platform
      // Ed25519 key when PLATFORM_ATTEST_KEY is set.
      await safe('audit_merkle_publish', () => buildDailyMerkleRoots(env, yesterday));
      // Daily — accrue late-payment fees against overdue invoices using
      // simple interest at prime + 1%, capped at 90 days.
      await safe('late_fee_accrual', () => computeLatePaymentFees(env));
      // Daily — roll om_telemetry into om_telemetry_daily / _weekly and
      // purge raw rows past the retention horizon. Bounds D1 storage cost
      // without losing the analytics history.
      await safe('telemetry_rollup', () => runTelemetryRollupAndPurge(env));
      // Daily digest sweep — find subscriptions due today by send_hour_sast.
      // Provider creds (SES/Twilio/WhatsApp) gate actual delivery; without
      // them rows land as 'would_send' so the history is still populated.
      await safe('digest_sweep', async () => {
        const subs = await env.DB.prepare(`
          SELECT * FROM oe_digest_subscriptions WHERE enabled = 1 LIMIT 500
        `).all<any>();
        for (const s of (subs.results || []) as any[]) {
          const stats = await env.DB.prepare(`
            SELECT
              (SELECT COUNT(*) FROM om_faults WHERE status IN ('open','acknowledged','in_progress')) AS open_faults,
              (SELECT COALESCE(SUM(hourly_loss_zar),0) FROM om_faults WHERE status IN ('open','acknowledged','in_progress')) AS bleed,
              (SELECT COUNT(*) FROM om_work_orders WHERE status NOT IN ('completed','verified','closed','cancelled')) AS open_wos
          `).first<any>();
          const body = `Open Energy Ops · morning briefing\n` +
            `${stats?.open_faults || 0} open faults bleeding R${Math.round(Number(stats?.bleed || 0))}/h\n` +
            `${stats?.open_wos || 0} active work orders`;
          const status = (env as any).EMAIL_API_KEY || (env as any).TWILIO_AUTH ? 'sent' : 'would_send';
          await env.DB.prepare(`
            INSERT INTO oe_digest_deliveries
              (id, subscription_id, channel, destination, status, body_preview, sent_at)
            VALUES (?,?,?,?,?,?,?)
          `).bind(
            `oedd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
            s.id, s.channel, s.destination, status, body.slice(0, 500),
            status === 'sent' ? new Date().toISOString() : null,
          ).run();
          await env.DB.prepare(`UPDATE oe_digest_subscriptions SET last_sent_at = datetime('now') WHERE id = ?`).bind(s.id).run();
        }
      });
      // Daily Merkle root build over yesterday's audit events per entity_type.
      // Provides O(log n) inclusion proofs from /api/public/audit/proof/:id.
      await safe('audit_merkle_build', async () => {
        const ets = await env.DB.prepare(
          `SELECT entity_type, COUNT(*) AS n FROM audit_events WHERE date(created_at) = ? GROUP BY entity_type`,
        ).bind(yesterday).all<any>();
        for (const r of (ets.results || []) as any[]) {
          const evs = await env.DB.prepare(
            `SELECT content_hash, sequence_no FROM audit_events WHERE entity_type = ? AND date(created_at) = ? ORDER BY sequence_no ASC`,
          ).bind(r.entity_type, yesterday).all<{ content_hash: string; sequence_no: number }>();
          const leaves = ((evs.results || []) as any[]).map((e) => e.content_hash);
          if (!leaves.length) continue;
          let level = leaves.slice();
          while (level.length > 1) {
            const next: string[] = [];
            for (let i = 0; i < level.length; i += 2) {
              const a = level[i]; const b = i + 1 < level.length ? level[i + 1] : a;
              const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a + b));
              next.push(Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join(''));
            }
            level = next;
          }
          const root = level[0];
          const arr = (evs.results || []) as any[];
          await env.DB.prepare(`
            INSERT OR REPLACE INTO oe_audit_merkle_roots
              (id, entity_type, day, event_count, first_sequence_no, last_sequence_no, merkle_root)
            VALUES (?,?,?,?,?,?,?)
          `).bind(
            `mr_${yesterday.replace(/-/g, '')}_${r.entity_type}`,
            r.entity_type, yesterday, arr.length,
            arr[0].sequence_no, arr[arr.length - 1].sequence_no, root,
          ).run();
        }
      });
      // Tenant usage rollup for yesterday — counts API mutations + webhook
      // deliveries + digest sends by participant. D1/Worker request counts
      // come from Cloudflare Analytics (separate ingestion) so we estimate
      // here from row activity rather than over-claim.
      await safe('tenant_usage_rollup', async () => {
        const rows = await env.DB.prepare(`
          SELECT participant_id, COUNT(*) AS n FROM audit_events
          WHERE created_at LIKE ? || '%'
          GROUP BY participant_id
        `).bind(yesterday).all<{ participant_id: string; n: number }>();
        for (const r of (rows.results || []) as any[]) {
          if (!r.participant_id) continue;
          // Rough estimates: 1 audit event ≈ 3 API calls × 5 D1 reads × 2 D1 writes
          const apiCalls = Number(r.n) * 3;
          const d1Reads = Number(r.n) * 15;
          const d1Writes = Number(r.n) * 2;
          // Workers @ $0.30/M + D1 reads @ $1.00/M + D1 writes @ $1.00/M
          const cost = (apiCalls * 0.0000003) + (d1Reads * 0.000001) + (d1Writes * 0.000001);
          await env.DB.prepare(`
            INSERT OR REPLACE INTO oe_tenant_usage
              (participant_id, day, worker_requests, d1_reads_est, d1_writes_est, est_cost_usd)
            VALUES (?,?,?,?,?,?)
          `).bind(r.participant_id, yesterday, apiCalls, d1Reads, d1Writes, cost).run();
        }
      });
      // Metering + ONA rollups for yesterday; prepare audit archive table
      // (actual archive upload runs on demand to stay under CPU limits).
      await safe('metering_daily_rollup', async () => {
        const rs = await env.DB.prepare(
          `SELECT connection_id,
                  SUM(export_kwh) AS exp_kwh,
                  SUM(import_kwh) AS imp_kwh,
                  MAX(peak_demand_kw) AS pk,
                  AVG(power_factor) AS pf,
                  COUNT(*) AS n,
                  SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) AS v
             FROM metering_readings
            WHERE reading_date LIKE ? || '%'
            GROUP BY connection_id`,
        ).bind(yesterday).all<{
          connection_id: string; exp_kwh: number; imp_kwh: number;
          pk: number | null; pf: number | null; n: number; v: number;
        }>();
        for (const r of rs.results || []) {
          const id = `mrd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
          await env.DB.prepare(
            `INSERT INTO metering_readings_daily
               (id, connection_id, reading_day, month_bucket, total_export_kwh, total_import_kwh,
                max_peak_demand_kw, avg_power_factor, reading_count, validated_count, last_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(connection_id, reading_day) DO UPDATE SET
               total_export_kwh = excluded.total_export_kwh,
               total_import_kwh = excluded.total_import_kwh,
               max_peak_demand_kw = excluded.max_peak_demand_kw,
               avg_power_factor = excluded.avg_power_factor,
               reading_count = excluded.reading_count,
               validated_count = excluded.validated_count,
               last_updated_at = datetime('now')`,
          ).bind(
            id, r.connection_id, yesterday, yesterday.slice(0, 7),
            r.exp_kwh, r.imp_kwh, r.pk, r.pf, r.n, r.v,
          ).run();
        }
      });

      await safe('ona_daily_rollup', async () => {
        const rs = await env.DB.prepare(
          `SELECT site_id,
                  MAX(CASE WHEN forecast_type = 'day_ahead' THEN generation_mwh END) AS da,
                  MAX(CASE WHEN forecast_type = 'intra_day' THEN generation_mwh END) AS id,
                  MAX(CASE WHEN forecast_type = 'weekly'    THEN generation_mwh END) AS wk
             FROM ona_forecasts
            WHERE forecast_date = ?
            GROUP BY site_id`,
        ).bind(yesterday).all<{ site_id: string; da: number | null; id: number | null; wk: number | null }>();
        for (const r of rs.results || []) {
          const actual = (await env.DB.prepare(
            `SELECT COALESCE(SUM(actual_mwh), 0) AS v FROM ona_nominations
              WHERE site_id = ? AND nomination_date = ?`,
          ).bind(r.site_id, yesterday).first<{ v: number }>())?.v || 0;
          const variance = r.da ? ((actual - r.da) / r.da) * 100 : null;
          await env.DB.prepare(
            `INSERT INTO ona_forecast_summary
               (id, site_id, forecast_day, day_ahead_mwh, intra_day_mwh, weekly_mwh, actual_mwh, variance_pct, last_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(site_id, forecast_day) DO UPDATE SET
               day_ahead_mwh = excluded.day_ahead_mwh,
               intra_day_mwh = excluded.intra_day_mwh,
               weekly_mwh = excluded.weekly_mwh,
               actual_mwh = excluded.actual_mwh,
               variance_pct = excluded.variance_pct,
               last_updated_at = datetime('now')`,
          ).bind(
            `ofs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            r.site_id, yesterday, r.da, r.id, r.wk, actual, variance,
          ).run();
        }
      });
      // Wave 2 — historical-simulation VaR + scenario engine. Iterates every
      // portfolio (system + user), computes 95% and 99% VaR + ES against the
      // last 250 days of factor history, then re-runs every system scenario
      // against every portfolio. Pure-function math via src/utils/var.ts —
      // all I/O is the D1 reads of positions and factor history, plus the
      // INSERT of the result rows. Well within the Worker 30s budget.
      await safe('var_compute', async () => {
        const portfolios = await env.DB.prepare(`SELECT * FROM risk_portfolios`).all<any>();
        const scenarios = await env.DB.prepare(`SELECT * FROM risk_scenarios WHERE is_system = 1`).all<any>();
        const allFactors = await env.DB.prepare(`SELECT id FROM risk_factors`).all<{ id: string }>();
        const factorIds = ((allFactors.results || []) as any[]).map(r => r.id);
        const fhRows = await env.DB.prepare(`
          SELECT factor_id, as_of_date, value FROM risk_factor_history
          ORDER BY factor_id ASC, as_of_date ASC
        `).all<{ factor_id: string; as_of_date: string; value: number }>();
        const history: Record<string, Array<{ as_of_date: string; value: number }>> = {};
        for (const r of (fhRows.results || []) as any[]) {
          (history[r.factor_id] ||= []).push({ as_of_date: r.as_of_date, value: Number(r.value) });
        }
        const { simulateHistoricalPnL, varAtConfidence, expectedShortfall, runScenario } = await import('./utils/var');
        for (const p of (portfolios.results || []) as any[]) {
          let filter: any = {};
          try { filter = JSON.parse(p.basis_filter_json || '{}'); } catch {}
          const where: string[] = [];
          const params: any[] = [];
          if (filter.trader_id) { where.push('participant_id = ?'); params.push(filter.trader_id); }
          if (filter.energy_type) { where.push('energy_type = ?'); params.push(filter.energy_type); }
          const positionsRes = await env.DB.prepare(`
            SELECT id, participant_id, energy_type, net_volume_mwh, last_mark_price
            FROM trader_positions
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            LIMIT 1000
          `).bind(...params).all<any>();
          const positions: any[] = [];
          for (const r of (positionsRes.results || []) as any[]) {
            const qty = Number(r.net_volume_mwh || 0);
            const mark = Number(r.last_mark_price || 0);
            if (qty === 0 || mark === 0) continue;
            positions.push({
              id: r.id,
              factor_id: `spot_${r.energy_type}`,
              side: qty > 0 ? 'long' : 'short',
              quantity: Math.abs(qty),
              mark_price: mark,
            });
          }
          const pnls = simulateHistoricalPnL(positions, history, 250);
          for (const conf of [0.95, 0.99]) {
            const v = varAtConfidence(pnls, conf);
            const es = expectedShortfall(pnls, conf);
            await env.DB.prepare(`
              INSERT INTO risk_var_results (
                id, portfolio_id, as_of_date, methodology, confidence, horizon_days,
                var_amount_zar, es_amount_zar, components_json, created_at
              ) VALUES (?, ?, ?, 'historical_simulation', ?, 1, ?, ?, ?, datetime('now'))
            `).bind(
              `vr_${today.replace(/-/g, '')}_${p.id}_${Math.round(conf * 100)}`,
              p.id, today, conf, v, es,
              JSON.stringify({ factors: factorIds, positions: positions.length }),
            ).run().catch(() => null);
          }
          // Scenarios — only system library on the nightly run; user-defined
          // are run on-demand via POST /api/risk/scenarios/:id/run.
          for (const s of (scenarios.results || []) as any[]) {
            let shocks: any[] = [];
            try { shocks = JSON.parse(s.factor_shocks_json || '[]'); } catch {}
            const r = runScenario(positions, shocks);
            await env.DB.prepare(`
              INSERT INTO risk_scenario_results (
                id, scenario_id, portfolio_id, as_of_date, pnl_impact_zar, breakdown_json, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              `sr_${today.replace(/-/g, '')}_${p.id}_${s.id}`,
              s.id, p.id, today, r.pnl, JSON.stringify(r.breakdown),
            ).run().catch(() => null);
          }
        }
      });

      // Wave 7 — offtaker PPA obligations sweep. Walk shortfall rows whose
      // cure_deadline_at has passed; flip to take_or_pay, compute liability,
      // fire the cascade so regulator inbox materialises a high-severity
      // entry (via regulator-inbox-spec). Daily granularity is enough — these
      // are monthly periods, not intraday.
      await safe('offtaker_obligation_sweep', async () => {
        const expired = await env.DB.prepare(`
          SELECT o.id, o.ppa_id, o.participant_id, o.counterparty_id, o.period_month,
                 o.contracted_mwh, o.delivered_mwh, o.threshold_pct,
                 COALESCE(p.price_zar_per_mwh, 0) AS price_zar_per_mwh,
                 COALESCE(p.take_or_pay_pct, 95) AS take_or_pay_pct
            FROM oe_offtaker_ppa_obligations o
            LEFT JOIN off_ppa_portfolio p ON p.id = o.ppa_id
           WHERE o.status = 'shortfall'
             AND o.cure_deadline_at IS NOT NULL
             AND o.cure_deadline_at <= datetime('now')
           LIMIT 50
        `).all<any>();

        const { takeOrPayLiability } = await import('./utils/offtaker-obligation-spec');
        const { fireCascade } = await import('./utils/cascade');

        for (const row of (expired.results || []) as any[]) {
          const liability = takeOrPayLiability({
            contracted_mwh: Number(row.contracted_mwh || 0),
            delivered_mwh: Number(row.delivered_mwh || 0),
            price_zar_per_mwh: Number(row.price_zar_per_mwh || 0),
            take_or_pay_pct: Number(row.take_or_pay_pct || 95),
          });

          await env.DB.prepare(`
            UPDATE oe_offtaker_ppa_obligations
               SET status = 'take_or_pay',
                   take_or_pay_amount_zar = ?,
                   escalated_at = datetime('now'),
                   updated_at = datetime('now')
             WHERE id = ?
          `).bind(liability, row.id).run().catch(() => null);

          await fireCascade({
            event: 'offtaker.obligation_take_or_pay',
            actor_id: 'system',
            entity_type: 'offtaker_ppa_obligation',
            entity_id: String(row.id),
            data: {
              obligation_id: row.id,
              ppa_id: row.ppa_id,
              participant_id: row.participant_id,
              counterparty_id: row.counterparty_id,
              period_month: row.period_month,
              contracted_mwh: Number(row.contracted_mwh || 0),
              delivered_mwh: Number(row.delivered_mwh || 0),
              take_or_pay_amount_zar: liability,
            },
            env,
          }).catch((e: unknown) => console.warn('offtaker_take_or_pay_cascade_failed', String(e)));
        }
      });

      // Wave 8 — grid wheeling escalation sweep: any 'disputed' charge whose
      // dispute_deadline_at has passed AND still has an open dispute row flips
      // to 'escalated' and posts a regulator-inbox cascade.
      await safe('grid_wheeling_escalation_sweep', async () => {
        const expired = await env.DB.prepare(`
          SELECT c.id, c.agreement_id, c.period_month, c.total_zar,
                 c.dispute_deadline_at
            FROM oe_grid_wheeling_charges c
           WHERE c.status = 'disputed'
             AND c.dispute_deadline_at IS NOT NULL
             AND c.dispute_deadline_at <= datetime('now')
             AND EXISTS (
               SELECT 1 FROM oe_grid_wheeling_disputes d
                WHERE d.charge_id = c.id AND d.status = 'open'
             )
           LIMIT 50
        `).all<any>();

        const { fireCascade } = await import('./utils/cascade');

        for (const row of (expired.results || []) as any[]) {
          await env.DB.prepare(`
            UPDATE oe_grid_wheeling_charges
               SET status = 'escalated',
                   escalated_at = datetime('now'),
                   escalated_to = 'regulator',
                   updated_at = datetime('now')
             WHERE id = ?
          `).bind(row.id).run().catch(() => null);

          await env.DB.prepare(`
            UPDATE oe_grid_wheeling_disputes
               SET status = 'escalated'
             WHERE charge_id = ? AND status = 'open'
          `).bind(row.id).run().catch(() => null);

          await fireCascade({
            event: 'grid.wheeling_charge_escalated',
            actor_id: 'system',
            entity_type: 'oe_grid_wheeling_charges',
            entity_id: String(row.id),
            data: {
              agreement_id: row.agreement_id,
              period_month: row.period_month,
              total_zar: Number(row.total_zar || 0),
              dispute_deadline_at: row.dispute_deadline_at,
            },
            env,
          }).catch((e: unknown) => console.warn('grid_wheeling_escalation_cascade_failed', String(e)));
        }
      });

      // Wave 9 — trader market-maker compliance sweep: walk yesterday's
      // performance row per active obligation and advance the breach state
      // machine. If an obligation has no perf row for yesterday we treat it
      // as a 'miss' day (silent absence == not quoting). Fire-once
      // transitions emit warning/breach/escalation cascades; escalation
      // crosses into the regulator inbox via regulator-inbox-spec.
      await safe('trader_mm_compliance_sweep', async () => {
        const oblsRes = await env.DB.prepare(`
          SELECT id, participant_id, energy_type,
                 two_sided_minutes_per_day, max_spread_bps, uptime_target_pct,
                 min_quote_volume_mwh, monthly_fee_zar,
                 COALESCE(consecutive_misses,0) AS consecutive_misses,
                 COALESCE(breach_status,'none') AS breach_status,
                 warning_threshold, breach_threshold, escalation_threshold
            FROM oe_mm_obligations
           WHERE status = 'active'
           LIMIT 500
        `).all<any>();

        const { evaluateCompliance, applyDailyOutcome,
          isWarningTransition, isBreachTransition,
          isEscalationTransition, isRecoveryTransition } = await import('./utils/mm-compliance-spec');
        const { fireCascade } = await import('./utils/cascade');

        for (const obl of (oblsRes.results || []) as any[]) {
          const existing = await env.DB.prepare(`
            SELECT id, compliance_status FROM oe_mm_performance
             WHERE obligation_id = ? AND day = ?
          `).bind(obl.id, yesterday).first<any>().catch(() => null);

          let todayStatus: 'compliant' | 'miss' | 'excused';
          let perfId: string;
          if (existing) {
            todayStatus = (existing.compliance_status as 'compliant' | 'miss' | 'excused') || 'miss';
            perfId = existing.id;
          } else {
            const verdict = evaluateCompliance(
              {
                two_sided_minutes_per_day: obl.two_sided_minutes_per_day,
                max_spread_bps: obl.max_spread_bps,
                uptime_target_pct: obl.uptime_target_pct,
                min_quote_volume_mwh: obl.min_quote_volume_mwh,
                monthly_fee_zar: obl.monthly_fee_zar,
              },
              { two_sided_minutes: 0, avg_spread_bps: 0, uptime_pct: 0, total_volume_mwh: 0 },
            );
            todayStatus = verdict.compliance_status;
            perfId = `mmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            await env.DB.prepare(`
              INSERT INTO oe_mm_performance (
                id, obligation_id, day, two_sided_minutes, avg_spread_bps,
                uptime_pct, total_volume_mwh, compliant, fee_earned_zar,
                penalty_zar, compliance_status
              ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, ?, ?)
            `).bind(
              perfId, obl.id, yesterday,
              verdict.fee_earned_zar, verdict.penalty_zar, verdict.compliance_status,
            ).run().catch(() => null);
          }

          const previousBreach = obl.breach_status as 'none' | 'warning' | 'breach' | 'escalated';
          const next = applyDailyOutcome({
            previousMisses: Number(obl.consecutive_misses || 0),
            previousBreach,
            todayStatus,
            thresholds: {
              warning_threshold: obl.warning_threshold,
              breach_threshold: obl.breach_threshold,
              escalation_threshold: obl.escalation_threshold,
            },
          });

          if (next.consecutive_misses === Number(obl.consecutive_misses || 0)
              && next.breach_status === previousBreach) {
            continue;
          }

          const sets: string[] = ['consecutive_misses = ?', 'breach_status = ?'];
          const params: unknown[] = [next.consecutive_misses, next.breach_status];
          if (isBreachTransition(previousBreach, next.breach_status)) {
            sets.push("last_breach_at = datetime('now')");
          }
          if (isEscalationTransition(previousBreach, next.breach_status)) {
            sets.push("last_escalated_at = datetime('now')");
          }
          params.push(obl.id);
          await env.DB.prepare(
            `UPDATE oe_mm_obligations SET ${sets.join(', ')} WHERE id = ?`,
          ).bind(...params).run().catch(() => null);

          if (isWarningTransition(previousBreach, next.breach_status)) {
            await fireCascade({
              event: 'trader.mm_obligation_warning',
              actor_id: 'system',
              entity_type: 'oe_mm_obligations',
              entity_id: obl.id,
              data: { participant_id: obl.participant_id, energy_type: obl.energy_type },
              env,
            }).catch((e: unknown) => console.warn('mm_warning_cascade_failed', String(e)));
          }
          if (isBreachTransition(previousBreach, next.breach_status)) {
            await fireCascade({
              event: 'trader.mm_obligation_breach',
              actor_id: 'system',
              entity_type: 'oe_mm_obligations',
              entity_id: obl.id,
              data: { participant_id: obl.participant_id, energy_type: obl.energy_type },
              env,
            }).catch((e: unknown) => console.warn('mm_breach_cascade_failed', String(e)));
          }
          if (isEscalationTransition(previousBreach, next.breach_status)) {
            await fireCascade({
              event: 'trader.mm_obligation_breach_escalated',
              actor_id: 'system',
              entity_type: 'oe_mm_obligations',
              entity_id: obl.id,
              data: {
                participant_id: obl.participant_id,
                energy_type: obl.energy_type,
                consecutive_misses: next.consecutive_misses,
              },
              env,
            }).catch((e: unknown) => console.warn('mm_escalation_cascade_failed', String(e)));
          }
          if (isRecoveryTransition(previousBreach, next.breach_status)) {
            await fireCascade({
              event: 'trader.mm_obligation_recovered',
              actor_id: 'system',
              entity_type: 'oe_mm_obligations',
              entity_id: obl.id,
              data: { participant_id: obl.participant_id, energy_type: obl.energy_type },
              env,
            }).catch((e: unknown) => console.warn('mm_recovery_cascade_failed', String(e)));
          }
        }
      });

      // Wave 10 — IPP performance-bond + insurance expiry sweep. Walks every
      // active bond and non-terminal insurance policy, advances expiry_status
      // through warning → cycle_1 → cycle_2 → cycle_3 → escalated, writes a
      // notice row per cycle entry, and fires fire-once cascades. Escalation
      // crosses into the regulator inbox via regulator-inbox-spec.
      await safe('ipp_bond_expiry_sweep', async () => {
        const result = await bondExpirySweep(env as never);
        console.log('ipp_bond_expiry_sweep', JSON.stringify(result));
      });

      // Wave 11 — Carbon MRV verification-chain SLA sweep. Walks all
      // non-terminal submissions in DOE/CRA states, marks last_sla_breach_at,
      // writes a sla_breached audit-chain event, and fires the
      // carbon.mrv_sla_breached cascade (regulator inbox high).
      await safe('mrv_chain_sla_sweep', async () => {
        const result = await mrvChainSlaSweep(env as never);
        console.log('mrv_chain_sla_sweep', JSON.stringify(result));
      });
      // Wave 12 — Esums site commissioning chain SLA breach sweep. Walks
      // non-terminal sites in onboarding states, marks
      // last_commissioning_sla_breach_at, writes sla_breached audit-chain
      // events, and fires esums.commissioning_sla_breached cascades.
      await safe('site_commissioning_sla_sweep', async () => {
        const result = await siteCommissioningSlaSweep(env as never);
        console.log('site_commissioning_sla_sweep', JSON.stringify(result));
      });
      // W104 Support ITIL Service Request — nightly entitlement window
      // sweep. Joins service-request rows against the W80 service-contract
      // chain and flips entitlement_status to 'contract_expired' when the
      // upstream service contract has expired or gone suspended. Keeps the
      // catalog gate honest day over day so a stale "entitled" flag does
      // not silently authorise fulfilment.
      await safe('service_request_entitlement_window_sweep', async () => {
        const result = await serviceRequestEntitlementWindowSweep(env as never);
        console.log('service_request_entitlement_window_sweep', JSON.stringify(result));
      });
      // W105 Grid Wholesale Imbalance Settlement — nightly aged-arrears
      // sweep. Walks invoice_issued/invoice_acknowledged/payment_pending/
      // aged_arrears rows past invoice_due_at with no payment_received_at,
      // re-computes arrears_days from invoice_due_at, sets arrears_bucket
      // (current/0_30/30_60/60_90/90_120/120_plus), and flips chain_status
      // to 'aged_arrears' once >=30 days past due. Crosses the regulator
      // inbox at >=60 days per W105 signature (default risk to settlement
      // system is reportable across every tier).
      await safe('imbalance_settlement_arrears_sweep', async () => {
        const result = await imbalanceSettlementArrearsSweep(env as never);
        console.log('imbalance_settlement_arrears_sweep', JSON.stringify(result));
      });
      // W106 Regulator NERSA s35 Enforcement Action — nightly appeal-window
      // sweep. Walks appeal_window_open rows past appeal_window_close_at
      // with no appeal_lodged_at, transitions to enforcement_in_progress
      // (deemed upheld by inaction). Strategic + licence-revocation rows
      // cross regulator inbox (Gazette publication required per Companies
      // Act s38).
      await safe('enforcement_action_s35_appeal_window_sweep', async () => {
        const result = await enforcementActionS35AppealWindowSweep(env as never);
        console.log('enforcement_action_s35_appeal_window_sweep', JSON.stringify(result));
      });
      // W107 Trader Pre-Trade Credit & Settlement-Risk — nightly KYC
      // recency + mark-age refresh. Walks every still-active pre-trade
      // check and recomputes kyc_recency_days from kyc_verified_at and
      // mark_age_seconds from last_mark_at. Does not change chain_status;
      // just keeps the LIVE counters honest so trader and compliance
      // dashboards never go stale. Real KYC re-validation happens
      // out-of-band; this just makes the recency-day counter accurate.
      await safe('pretrade_credit_kyc_recency_sweep', async () => {
        const result = await pretradeCreditKycRecencySweep(env as never);
        console.log('pretrade_credit_kyc_recency_sweep', JSON.stringify(result));
      });
      // W108 Lender Loan Restructure & A&E — daily consent-deadline
      // countdown sweep. Walks every consent_solicitation row, refreshes
      // consent_majority_pct from current syndicate_consented /
      // syndicate_size and recomputes consent_majority_passed against the
      // LMA consent_threshold_pct (simple 50% / special 66.7% / super 75%
      // / unanimity 100%). When consent_deadline_at has elapsed without
      // majority an event is recorded so the desk sees the solicitation
      // failed; the row stays in consent_solicitation so the operator can
      // abandon or relaunch. Does not auto-transition — restructure
      // decisions are too high-stakes for unattended state moves.
      await safe('loan_restructure_consent_deadline_sweep', async () => {
        const result = await loanRestructureConsentDeadlineSweep(env as never);
        console.log('loan_restructure_consent_deadline_sweep', JSON.stringify(result));
      });
      // W109 Carbon Credit Quality Rating — daily monitoring-freshness
      // scan. Walks every published or monitoring row, refreshes
      // monitoring_freshness_days from last_monitoring_data_at and flips
      // monitoring_data_stale when >=90 days. Auto-fires trigger_rerating
      // (system actor) on stale rows so the continuous re-rating loop
      // closes without operator action — the key differentiator vs static
      // Sylvera / BeZero letter-ratings. Material downgrades discovered
      // during re-rating cross regulator and hand off to W42 buffer-pool
      // drawdown queue. Bridges to W37 PDD + W11 MRV verification chains.
      await safe('carbon_credit_rating_monitoring_freshness_scan', async () => {
        const result = await carbonCreditRatingMonitoringFreshnessScan(env as never);
        console.log('carbon_credit_rating_monitoring_freshness_scan', JSON.stringify(result));
      });
      // W110 Grid Transmission Outage Coordination — nightly outage-window
      // monitor. Walks outage_in_progress / extended rows past
      // scheduled_end_at without complete_outage being called, flips
      // extension_requested=1 so the LIVE battery's
      // extension_imminent_live flag fires the next day, logs an
      // overdue-window event. Does NOT auto-transition — completion
      // confirmation must come from the SO; this just keeps the dashboard
      // honest. Sister of carbon_credit_rating_monitoring_freshness_scan
      // (passive evidence keeper).
      await safe('transmission_outage_window_monitor', async () => {
        const result = await transmissionOutageWindowMonitor(env as never);
        console.log('transmission_outage_window_monitor', JSON.stringify(result));
      });
      // Layer D — roll yesterday's platform-event stream into the daily +
      // cumulative rollup tables the dashboards read (never the raw log).
      await safe('metrics_rollup', () => rollupMetrics(env, yesterday));
      break;

    case '10 0 * * *':
      // T+1 settlement cycle — auto-create + auto-net for yesterday's
      // fills, then leave at net_calculated state for operator novate/settle.
      await safe('settlement_cycle_create', async () => {
        const cycleId = `cyc_${yesterday.replace(/-/g, '')}`;
        await env.DB.prepare(`
          INSERT OR IGNORE INTO oe_settlement_cycles (id, trade_date, value_date, status)
          VALUES (?,?,?,'open')
        `).bind(cycleId, yesterday, today).run();
      });
      await safe('daily_settlement', async () => {
        const runId = `sr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const idempotencyKey = `ppa_energy:${yesterday}:${yesterday}`;
        const existing = await env.DB.prepare(
          `SELECT id FROM settlement_runs WHERE idempotency_key = ?`,
        ).bind(idempotencyKey).first();
        if (existing) return;
        await env.DB.prepare(
          `INSERT INTO settlement_runs (id, run_type, period_start, period_end, status, idempotency_key)
           VALUES (?, 'ppa_energy', ?, ?, 'running', ?)`,
        ).bind(runId, yesterday, yesterday, idempotencyKey).run();
        await executeSettlementRun(env, runId, 'ppa_energy', yesterday, yesterday);
      });
      await safe('daily_imbalance_settlement', async () => {
        // BRP imbalance settles over the same 24h window. UPSERTs make this
        // idempotent; a separate idempotency-key table isn't required.
        const imbRunId = `imb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await env.DB.prepare(
          `INSERT INTO imbalance_settlement_runs (id, period_from, period_to, status)
           VALUES (?, ?, ?, 'running')`,
        ).bind(imbRunId, yesterday, today).run();
        try {
          const r = await executeImbalanceRun(env, imbRunId, yesterday, today);
          await env.DB.prepare(
            `UPDATE imbalance_settlement_runs
             SET status = 'succeeded', periods_settled = ?, brps_settled = ?,
                 net_charge_zar_total = ?, finished_at = datetime('now')
             WHERE id = ?`,
          ).bind(r.periodsSettled, r.brpsSettled, r.netChargeTotal, imbRunId).run();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await env.DB.prepare(
            `UPDATE imbalance_settlement_runs
             SET status = 'failed', error_message = ?, finished_at = datetime('now')
             WHERE id = ?`,
          ).bind(msg, imbRunId).run();
          throw err;
        }
      });
      break;

    case '30 0 * * *':
      await safe('usage_snapshot', async () => {
        const rs = await env.DB.prepare(
          `SELECT t.id AS tid,
                  COUNT(p.id) AS n,
                  SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS a
             FROM tenants t
             LEFT JOIN participants p ON p.tenant_id = t.id
            GROUP BY t.id`,
        ).all<{ tid: string; n: number; a: number }>();
        for (const r of rs.results || []) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO tenant_usage_snapshots
               (id, tenant_id, snapshot_date, participant_count, active_participant_count, seat_count, api_calls_count, storage_bytes)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
          ).bind(
            `tus_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            r.tid, today, r.n, r.a, r.a,
          ).run();
        }
      });

      await safe('margin_call_run', async () => {
        const rs = await env.DB.prepare(
          `SELECT p.id AS pid,
                  COALESCE(SUM(o.remaining_volume_mwh * COALESCE(m.mark_price_zar_mwh, o.price, 0)), 0) AS exposure
             FROM participants p
             LEFT JOIN trade_orders o ON o.participant_id = p.id AND o.status IN ('open','partially_filled')
             LEFT JOIN mark_prices m
               ON m.energy_type = o.energy_type
              AND (m.delivery_date = o.delivery_date OR (m.delivery_date IS NULL AND o.delivery_date IS NULL))
            GROUP BY p.id`,
        ).all<{ pid: string; exposure: number }>();
        for (const row of rs.results || []) {
          if (row.exposure <= 0) continue;
          const im = Math.abs(row.exposure) * 0.10;
          const posted = (await env.DB.prepare(
            `SELECT COALESCE(SUM(balance_zar), 0) AS b FROM collateral_accounts WHERE participant_id = ? AND status = 'active'`,
          ).bind(row.pid).first<{ b: number }>())?.b || 0;
          const shortfall = Math.max(0, im - posted);
          if (shortfall <= 0) continue;
          const dueBy = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
          await env.DB.prepare(
            `INSERT INTO margin_calls (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar, posted_collateral_zar, shortfall_zar, due_by, status)
             VALUES (?, ?, datetime('now'), ?, ?, 0, ?, ?, ?, 'open')`,
          ).bind(
            `mc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            row.pid, row.exposure, im, posted, shortfall, dueBy,
          ).run();
        }
      });
      // Wave 115 - IPP Submittal nightly refresh: recompute submittal
      // completeness index + health band (green/amber/red/critical) without
      // a state transition. Decisions are never moved by cron; only the
      // LIVE battery is refreshed so dashboards reflect today's truth at
      // 00:30 UTC = 02:30 SAST. Distinct from the 15-min SLA sweep.
      await safe('ipp_submittal_cycle_refresh', async () => {
        const result = await ippSubmittalCycleRefresh(env as never);
        console.log('ipp_submittal_cycle_refresh', JSON.stringify(result));
      });
      break;

    case '35 0 * * *':
      // Wave 116 - IPP RFI nightly aging refresh: recompute rfi_age_days +
      // completeness_index + rfi_health_band on all active (non-terminal)
      // RFIs without auto-transitioning. Decisions are never moved by cron;
      // only the LIVE battery is refreshed so dashboards reflect today's truth
      // at 00:35 UTC = 02:35 SAST. Distinct from the 15-min SLA sweep.
      await safe('ipp_rfi_aging_refresh', async () => {
        const result = await ippRfiAgingRefresh(env as never);
        console.log('ipp_rfi_aging_refresh', JSON.stringify(result));
      });
      break;

    case '40 0 * * *':
      // Wave 117 - IPP Change Order nightly cumulative_change_value_pct +
      // cap-band + aging refresh: walks all active (non-terminal) CRs per
      // project, recomputes cumulative_change_value_zar / _pct against
      // contract_value_zar, re-derives cumulative_cap_band (clear/watch/
      // warning/breach), refreshes change_order_age_days + completeness +
      // health_band. Decisions are never moved by cron; only the LIVE
      // battery is refreshed so dashboards reflect today's truth at 00:40
      // UTC = 02:40 SAST. Distinct from the 15-min SLA sweep.
      await safe('ipp_change_order_cum_pct_refresh', async () => {
        const result = await ippChangeOrderCumPctRefresh(env as never);
        console.log('ipp_change_order_cum_pct_refresh', JSON.stringify(result));
      });
      break;

    case '45 0 * * *':
      // Wave 118 - Audit Chain daily reconciliation + chain-link verify
      // attestation roll-up. Refreshes block_age_hours + integrity_index +
      // block_completeness_index + block_health_band + days_to_quarterly_
      // attestation across every active audit block, and re-verifies
      // Bitcoin-style parent_block_hash linkage for published+ blocks.
      // Any broken link increments cross_chain_break_count + sets
      // signature_chain_break_detected=1 (which lifts the FLOOR-AT-MONTHLY
      // floor). Daily attestation at 02:45 SAST = 00:45 UTC.
      await safe('audit_chain_daily_reconcile_sweep', async () => {
        const result = await auditChainDailyReconcileSweep(env as never);
        console.log('audit_chain_daily_reconcile_sweep', JSON.stringify(result));
      });
      // Watershed nightly: anomaly scan + maturity refresh per tenant participant.
      await safe('watershed_anomaly_scan', async () => {
        const parts = await env.DB.prepare(`SELECT DISTINCT participant_id FROM esg_activity_transactions LIMIT 200`).all<{ participant_id: string }>();
        for (const p of (parts.results || [])) {
          // Spike rule
          const spikes = await env.DB.prepare(`
            WITH monthly AS (
              SELECT id, activity_code, substr(activity_date, 1, 7) AS ym, emissions_kg_co2e
              FROM esg_activity_transactions WHERE participant_id = ?
            )
            SELECT m.id, m.ym, m.emissions_kg_co2e AS emissions,
                   (SELECT AVG(m2.emissions_kg_co2e) FROM monthly m2 WHERE m2.activity_code = m.activity_code AND m2.ym < m.ym) AS prior_avg
            FROM monthly m
          `).bind(p.participant_id).all<{ id: string; ym: string; emissions: number; prior_avg: number }>();
          for (const row of (spikes.results || [])) {
            if (row.prior_avg && row.emissions > row.prior_avg * 4) {
              await env.DB.prepare(`
                INSERT OR IGNORE INTO esg_anomaly_flags (id, transaction_id, participant_id, rule, severity, detail, expected_value, observed_value)
                VALUES (?, ?, ?, 'spike_30d', 'high', ?, ?, ?)
              `).bind(
                `anf_cron_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                row.id, p.participant_id, `Cron-detected spike vs ${row.ym} prior-month avg`, row.prior_avg, row.emissions,
              ).run();
            }
          }
        }
      });

      await safe('watershed_maturity_refresh', async () => {
        const year = new Date().getFullYear();
        const parts = await env.DB.prepare(`SELECT id FROM participants WHERE status = 'active' LIMIT 200`).all<{ id: string }>();
        for (const p of (parts.results || [])) {
          // Re-compute using same heuristic as POST /api/watershed/maturity/score
          const txByScope = await env.DB.prepare(
            `SELECT scope, COUNT(*) AS n FROM esg_activity_transactions WHERE participant_id = ? AND substr(activity_date, 1, 4) = ? GROUP BY scope`,
          ).bind(p.id, String(year)).all<{ scope: number; n: number }>();
          const scopes = new Set((txByScope.results || []).map(r => r.scope));
          let measurement = (scopes.has(1) ? 30 : 0) + (scopes.has(2) ? 30 : 0) + (scopes.has(3) ? 40 : 0);
          const disc = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM esg_disclosures WHERE participant_id = ?`).bind(p.id).first<{ n: number }>())?.n || 0;
          const tgt = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM esg_targets WHERE participant_id = ?`).bind(p.id).first<{ n: number }>())?.n || 0;
          const init = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM esg_initiatives WHERE participant_id = ? AND status = 'completed'`).bind(p.id).first<{ n: number }>())?.n || 0;
          const jur = (await env.DB.prepare(`SELECT COUNT(DISTINCT jurisdiction) AS n FROM disclosure_submissions WHERE participant_id = ? AND status IN ('submitted','accepted')`).bind(p.id).first<{ n: number }>())?.n || 0;
          const governance = Math.min(100, disc * 25);
          const target = Math.min(100, tgt * 30);
          const action = Math.min(100, init * 20);
          const disclosure = Math.min(100, jur * 20);
          const overall = (measurement * 0.25) + (governance * 0.15) + (target * 0.20) + (action * 0.25) + (disclosure * 0.15);
          const band = overall >= 80 ? 'leader' : overall >= 60 ? 'advanced' : overall >= 40 ? 'intermediate' : overall >= 20 ? 'beginner' : 'starter';
          await env.DB.prepare(`
            INSERT INTO climate_maturity_assessments (id, participant_id, reporting_year, measurement_score, governance_score, target_score, action_score, disclosure_score, overall_score, band, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            `mat_cron_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            p.id, year, measurement, governance, target, action, disclosure, overall, band,
            'Nightly cron refresh',
          ).run();
        }
      });

      await safe('watershed_cfe_monthly_rollup', async () => {
        // Roll up the prior month's hourly load/gen into cfe_match_summary
        // for any participant with hourly data.
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
        const parts = await env.DB.prepare(
          `SELECT DISTINCT participant_id FROM cfe_hourly_load WHERE hour_utc >= ? AND hour_utc <= ? LIMIT 200`,
        ).bind(monthStart, monthEnd).all<{ participant_id: string }>();
        for (const p of (parts.results || [])) {
          const load = await env.DB.prepare(
            `SELECT hour_utc, SUM(load_kwh) AS l FROM cfe_hourly_load WHERE participant_id = ? AND hour_utc >= ? AND hour_utc <= ? GROUP BY hour_utc`,
          ).bind(p.participant_id, monthStart, monthEnd).all<{ hour_utc: string; l: number }>();
          const gen = await env.DB.prepare(
            `SELECT hour_utc, SUM(generation_kwh) AS g FROM cfe_hourly_generation WHERE participant_id = ? AND hour_utc >= ? AND hour_utc <= ? GROUP BY hour_utc`,
          ).bind(p.participant_id, monthStart, monthEnd).all<{ hour_utc: string; g: number }>();
          const lm = new Map<string, number>(); for (const r of load.results || []) lm.set(r.hour_utc, r.l || 0);
          const gm = new Map<string, number>(); for (const r of gen.results || []) gm.set(r.hour_utc, r.g || 0);
          let totalL = 0, totalCF = 0, full = 0, zero = 0;
          for (const [h, l] of lm) {
            const g = gm.get(h) || 0;
            totalL += l; totalCF += Math.min(l, g);
            if (g >= l && l > 0) full++;
            if (g === 0) zero++;
          }
          if (totalL <= 0) continue;
          const matchPct = (totalCF / totalL) * 100;
          const gridK = 0.92;
          const avoided = (totalCF * gridK) / 1000;
          await env.DB.prepare(`
            INSERT OR REPLACE INTO cfe_match_summary (participant_id, reporting_period_start, reporting_period_end, total_load_kwh, total_carbon_free_kwh, cfe_match_pct, hours_with_full_match, hours_with_zero_match, avg_grid_intensity_kg_kwh, emissions_avoided_tco2e)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(p.participant_id, monthStart, monthEnd, totalL, totalCF, matchPct, full, zero, gridK, avoided).run();
        }
      });

      // L5 — nightly tamper-evident audit-chain verify across every feature
      // chain. Hashes are recomputed from sequence_no=1 each night; any
      // divergence is logged at error level so the on-call dashboard /
      // SIEM forwarders surface it. The verify itself persists
      // last_verified_at into audit_chain_state on success, which the
      // workstation UIs surface as "verified · <timestamp>".
      await safe('audit_chain_verify_all', async () => {
        const features = ['trading','settlement','carbon','ipp','offtaker',
                          'lender','grid','regulator','admin','support',
                          'auth','contracts','marketplace','esg','platform'];
        for (const feature of features) {
          const result = await verifyChain(env, feature).catch((e) => ({
            entity_type: feature, ok: false, scanned: 0,
            head_hash: null, head_sequence: 0,
            first_divergence_seq: null, expected_hash: null, stored_hash: null,
            duration_ms: 0, error: (e as Error).message,
          } as unknown as Awaited<ReturnType<typeof verifyChain>>));
          if (!result.ok) {
            logger.error('audit_chain_divergence', {
              entity_type: feature,
              first_divergence_seq: result.first_divergence_seq,
              expected_hash: result.expected_hash,
              stored_hash: result.stored_hash,
            });
          }
        }
      });
      // W122 SCADA connector telemetry refresh: nightly walk over every
      // active connector to recompute the persisted telemetry_quality_
      // index + connector_health_band from latest p50/p99/jitter/loss/SNR
      // observations. 02:45 SAST = 00:45 UTC. Decisions are never moved
      // by cron; only the LIVE battery is refreshed so dashboards reflect
      // last 24h trust signal.
      await safe('scada_connector_telemetry_refresh', async () => {
        const result = await scadaConnectorTelemetryRefreshSweep(env as never);
        console.log('scada_connector_telemetry_refresh', JSON.stringify(result));
      });
      // W123 MQTT / OPC-UA IIoT connector telemetry refresh: nightly
      // walk over every active connector to recompute the persisted
      // telemetry_quality_index + connector_health_band from latest
      // QoS p99 / publisher count / topic depth / CSIP command ratio /
      // payload quality observations. 02:45 SAST = 00:45 UTC. Decisions
      // never moved by cron; only the LIVE battery is refreshed so
      // dashboards reflect last 24h trust signal.
      await safe('mqtt_opcua_connector_telemetry_refresh', async () => {
        const result = await mqttOpcuaConnectorTelemetryRefreshSweep(env as never);
        console.log('mqtt_opcua_connector_telemetry_refresh', JSON.stringify(result));
      });
      break;

    case '50 0 * * *':
      // Wave 119 — Certified Regulator Export Packs daily refresh.
      // 02:50 SAST = 00:50 UTC. Refreshes all 5 LIVE-derived persisted
      // scoring fields (completeness_index, xbrl_conformance_score,
      // esg_narrative_quality, controls_narrative_completeness,
      // integrity_chain_score) + health_band + days_to_quarterly_cutoff
      // across every active pack. Used so list views can sort by
      // health/score without re-deriving on every read.
      await safe('regulator_export_daily_refresh_sweep', async () => {
        const result = await regulatorExportDailyRefreshSweep(env as never);
        console.log('regulator_export_daily_refresh_sweep', JSON.stringify(result));
      });
      break;

    case '55 0 * * *':
      // Wave 120 — Reconciliation Attestation nightly variance recompute.
      // 02:55 SAST = 00:55 UTC. Re-derives all 4 LIVE scoring indexes
      // (reconciliation_completeness_index, icfr_control_effectiveness_
      // index, variance_score_index, remediation_progress_index) +
      // attestation_health_band + days_to_quarterly_attestation across
      // every active attestation. Used so list views can sort by
      // health/score without re-deriving on every read.
      await safe('reconciliation_attestation_variance_recompute_sweep', async () => {
        const result = await reconciliationAttestationVarianceRecomputeSweep(env as never);
        console.log('reconciliation_attestation_variance_recompute_sweep', JSON.stringify(result));
      });
      break;

    case '58 0 * * *':
      // Wave 121 — Control-Environment Audit nightly evidence-coverage
      // recompute. 02:58 SAST = 00:58 UTC. Re-derives all 4 LIVE scoring
      // indexes (design_documentation_completeness_index, tod_test_
      // completeness_index, tooe_test_completeness_index, evidence_
      // coverage_index) + control_health_band + days_to_quarterly_cutoff
      // + days_to_annual_audit across every active control dossier. Used
      // so list views can sort by health/score without re-deriving on
      // every read.
      await safe('control_environment_audit_nightly_evidence_coverage_sweep', async () => {
        const result = await controlEnvironmentAuditNightlyEvidenceCoverageSweep(env as never);
        console.log('control_environment_audit_nightly_evidence_coverage_sweep', JSON.stringify(result));
      });
      break;

    case '0 6 1 1 *':
      // Wave 121 — annual external-audit cycle opener. 1 January at
      // 08:00 SAST (06:00 UTC). Raises iso27001_surveillance_audit_due
      // + sox_404_attestation_pending + soc2_type2_period_open on every
      // active control whose framework lists the corresponding standard.
      // Flips regulator_relevant=1 + is_reportable_flag=1 to indicate the
      // annual external-audit cycle is open.
      await safe('control_environment_audit_annual_audit_cycle_opener_sweep', async () => {
        const result = await controlEnvironmentAuditAnnualAuditCycleOpenerSweep(env as never);
        console.log('control_environment_audit_annual_audit_cycle_opener_sweep', JSON.stringify(result));
      });
      break;

    case '0 2 1 * *':
      await safe('platform_invoice_run', async () => {
        const periodStart = month + '-01';
        const periodEnd = today;
        const subs = await env.DB.prepare(
          `SELECT s.id AS sid, s.tenant_id, s.amount_zar
             FROM tenant_subscriptions s
            WHERE s.status IN ('active','trialing')
              AND s.period_start <= ? AND s.period_end >= ?`,
        ).bind(periodEnd, periodStart).all<{ sid: string; tenant_id: string; amount_zar: number }>();
        for (const s of subs.results || []) {
          if (s.amount_zar <= 0) continue;
          const vat = s.amount_zar * 0.15;
          const total = s.amount_zar + vat;
          const id = `tinv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
          const invNum = `OE-${now.getFullYear()}-${id.slice(-8).toUpperCase()}`;
          await env.DB.prepare(
            `INSERT INTO tenant_invoices
               (id, tenant_id, subscription_id, invoice_number, period_start, period_end,
                line_items_json, subtotal_zar, vat_rate, vat_zar, total_zar, status, issued_at, due_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.15, ?, ?, 'issued', datetime('now'), date('now','+30 days'))`,
          ).bind(
            id, s.tenant_id, s.sid, invNum, periodStart, periodEnd,
            JSON.stringify([{ description: 'Platform subscription', amount_zar: s.amount_zar }]),
            s.amount_zar, vat, total,
          ).run();
        }
      });
      break;

    case '0 4 1 * *':
      // Wave 119 — monthly rollup. 1st of month 06:00 SAST (04:00 UTC).
      // Flags every monthly_return pack whose target period closed last
      // month as regulator_relevant=1 so the regulator inbox materializer
      // surfaces them. Used to drive the monthly_return cadence visibility
      // for NERSA / IPPO / SARB / SARS dashboards.
      await safe('regulator_export_monthly_rollup_sweep', async () => {
        const result = await regulatorExportMonthlyRollupSweep(env as never);
        console.log('regulator_export_monthly_rollup_sweep', JSON.stringify(result));
      });
      break;

    case '0 5 1 * *':
      // Wave 120 — monthly audit-committee pack rollup. 1st of month
      // 07:00 SAST (05:00 UTC). Flags every quarterly + annual
      // attestation whose attestation period closed last month as
      // regulator_relevant=1 so the regulator inbox materializer surfaces
      // them. Drives monthly audit-committee + JSE Listings 8.62 +
      // Companies Act s30 visibility dashboards.
      await safe('reconciliation_attestation_monthly_audit_committee_pack_sweep', async () => {
        const result = await reconciliationAttestationMonthlyAuditCommitteePackSweep(env as never);
        console.log('reconciliation_attestation_monthly_audit_committee_pack_sweep', JSON.stringify(result));
      });
      break;

    case '0 6 1 * *':
      // Wave 3 — 1st of month 08:00 SAST (06:00 UTC) CPMI-IOSCO PFMI
      // monthly quantitative disclosure compute. Snapshot is computed but
      // NOT auto-published — a regulator-role user must POST /publish.
      await safe('clearing_disclosure_monthly', async () => {
        const dt = new Date();
        dt.setUTCDate(0); // last day of previous month
        const asOf = dt.toISOString().slice(0, 10);
        // Inline inputs gather — same shape as routes/clearing-disclosure.ts.
        const safeRead = async <T>(q: () => Promise<T>, fb: T) => {
          try { return await q(); } catch { return fb; }
        };
        const num = (r: any, k = 's') => Number(r?.[k] || 0);
        const im = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COALESCE(SUM(initial_margin_zar),0) AS s FROM oe_margin_calls WHERE status IN ('open','posted')`,
        ).first()), 0);
        const vm = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COALESCE(SUM(variation_margin_zar),0) AS s FROM oe_margin_calls WHERE status IN ('open','posted')`,
        ).first()), 0);
        const var99 = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COALESCE(SUM(var_zar),0) AS s FROM risk_var_results
            WHERE confidence = 0.99 AND as_of_date = (SELECT MAX(as_of_date) FROM risk_var_results)`,
        ).first()), 0);
        const qlr = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COALESCE(SUM(balance_zar),0) AS s FROM collateral_accounts WHERE asset_type IN ('cash','t_bill','bond')`,
        ).first()), 0);
        const largest = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COALESCE(MAX(exposure),0) AS s FROM (
             SELECT counterparty_id, SUM(ABS(net_volume_mwh * last_mark_price)) AS exposure
               FROM trader_positions GROUP BY counterparty_id
           )`,
        ).first()), 0);
        const df_bal = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COALESCE(SUM(amount_zar - COALESCE(refund_amount_zar,0)),0) AS s
             FROM oe_clearing_contributions WHERE status='active'`,
        ).first()), 0);
        const df_req = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COALESCE(SUM(total_size_zar),0) AS s FROM oe_clearing_fund WHERE status='active'`,
        ).first()), 0);
        const cap = await safeRead(async () => {
          const raw = await (env.KV?.get?.('ccp:capital_zar') ?? Promise.resolve(null));
          return raw ? Number(raw) : 0;
        }, 0);
        const settled = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COUNT(*) AS s FROM oe_settlement_instructions WHERE status='confirmed'`,
        ).first()), 0);
        const failed = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COUNT(*) AS s FROM oe_settlement_instructions WHERE status='failed'`,
        ).first()), 0);
        const members = await safeRead(async () => num(await env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id) AS s FROM users WHERE active = 1`,
        ).first()), 0);

        const snap = computeDisclosure({
          initial_margin_total_zar: im,
          variation_margin_total_zar: vm,
          margin_var99_lookback_zar: var99,
          qualifying_liquid_resources_zar: qlr,
          largest_member_exposure_zar: largest,
          default_fund_balance_zar: df_bal,
          default_fund_required_zar: df_req,
          ccp_capital_zar: cap,
          ccp_capital_sitg_pct: 0.25,
          settled_instruction_count: settled,
          failed_instruction_count: failed,
          active_member_count: members,
        }, asOf);

        const id = `cds_${asOf.replace(/-/g, '')}`;
        await env.DB.prepare(`
          INSERT OR REPLACE INTO clearing_disclosure_snapshots (
            id, as_of_date, initial_margin_total_zar, variation_margin_total_zar, margin_coverage_pct,
            qualifying_liquid_resources_zar, largest_member_exposure_zar, liquidity_coverage_ratio,
            default_fund_balance_zar, default_fund_required_zar, default_fund_coverage_ratio,
            ccp_capital_zar, ccp_capital_skin_in_game_zar,
            settlement_finality_pct, failed_instruction_count, active_member_count, computed_by
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          id, asOf,
          snap.initial_margin_total_zar, snap.variation_margin_total_zar, snap.margin_coverage_pct,
          snap.qualifying_liquid_resources_zar, snap.largest_member_exposure_zar, snap.liquidity_coverage_ratio,
          snap.default_fund_balance_zar, snap.default_fund_required_zar, snap.default_fund_coverage_ratio,
          snap.ccp_capital_zar, snap.ccp_capital_skin_in_game_zar,
          snap.settlement_finality_pct, snap.failed_instruction_count, snap.active_member_count,
          'cron',
        ).run();

        const breaches = evaluateBreaches(snap);
        await fireCascade({
          event: 'clearing.disclosure.computed',
          actor_id: 'system',
          entity_type: 'clearing_disclosure_snapshot',
          entity_id: id,
          data: { as_of_date: asOf, breach_count: breaches.length },
          env,
        });
      });
      break;

    case '0 7 * * 1':
      // W122 SCADA connector — Monday 09:00 SAST = 07:00 UTC weekly
      // cert-expiry sweep. Walks every connector with a tls_cert_expiry_at,
      // recomputes days_to_cert_renewal, flags any connector with cert
      // expiring within 60d (escalation_level=1) or 14d (escalation_level=2)
      // so the dashboard surfaces revocation risk BEFORE the counterparty
      // pulls the plug. No state transition — decisions stay with the
      // operator. INVERTED-SLA + LIVE-battery is unaffected; this is a
      // dedicated weekly slot so heavy SLA sweeps don't drown out the
      // cert-renewal signal.
      await safe('scada_connector_cert_expiry_sweep', async () => {
        const result = await scadaConnectorCertExpirySweep(env as never);
        console.log('scada_connector_cert_expiry_sweep', JSON.stringify(result));
      });
      // W123 MQTT / OPC-UA IIoT connector — same Monday 09:00 SAST
      // weekly cert-expiry sweep. Walks every IoT connector with a
      // tls_cert_expiry_at, recomputes days_to_cert_renewal, flags
      // 14d-out as regulator_relevant + is_reportable so the dashboard
      // surfaces IoT-broker cert revocation risk BEFORE the
      // counterparty pulls the plug. Shared trigger with W122 - no
      // duplicate cron entry in wrangler.toml.
      await safe('mqtt_opcua_connector_cert_expiry_sweep', async () => {
        const result = await mqttOpcuaConnectorCertExpirySweep(env as never);
        console.log('mqtt_opcua_connector_cert_expiry_sweep', JSON.stringify(result));
      });
      // W124 STRATE / SWIFT settlement connector — same Monday 09:00
      // SAST weekly key-expiry sweep. Walks every connector with a
      // swift_user_key_expiry_at / strate_certificate_expiry_at,
      // recomputes days_to_key_renewal, flags 14d-out as
      // regulator_relevant + is_reportable so the dashboard surfaces
      // SWIFT user-key / STRATE cert revocation risk BEFORE the
      // counterparty pulls the plug. Shared trigger with W122/W123 -
      // no duplicate cron entry in wrangler.toml.
      await safe('strate_swift_connector_key_expiry_sweep', async () => {
        const result = await strateSwiftConnectorKeyExpirySweep(env as never);
        console.log('strate_swift_connector_key_expiry_sweep', JSON.stringify(result));
      });
      // W125 SAP / Oracle ERP connector — same Monday 09:00 SAST weekly
      // service-account credential-expiry sweep. Walks every connector
      // with a service_account_credential_fingerprint + credential_expiry_at,
      // recomputes days_to_credential_renewal, flags 14d-out as
      // regulator_relevant + is_reportable so the dashboard surfaces ERP
      // service-account rotation risk BEFORE the ERP system owner
      // disables the account. Shared trigger with W122/W123/W124 - no
      // duplicate cron entry in wrangler.toml.
      await safe('sap_oracle_erp_connector_credential_expiry_sweep', async () => {
        const result = await sapOracleErpConnectorCredentialExpirySweep(env as never);
        console.log('sap_oracle_erp_connector_credential_expiry_sweep', JSON.stringify(result));
      });
      // W126 CIPC / SARS / NERSA government-filing connector — same
      // Monday 09:00 SAST weekly e-filing credential-expiry sweep. Walks
      // every connector with a credential_expiry_at, recomputes
      // days_to_credential_renewal, flags 14d-out as regulator_relevant
      // + is_reportable so the dashboard surfaces SARS e-Filing profile
      // / CIPC director-cert rotation risk BEFORE the authority disables
      // the account. Shared trigger with W122/W123/W124/W125 - no
      // duplicate cron entry in wrangler.toml.
      await safe('government_filing_connector_credential_expiry_sweep', async () => {
        const result = await governmentFilingConnectorCredentialExpirySweep(env as never);
        console.log('government_filing_connector_credential_expiry_sweep', JSON.stringify(result));
      });
      // W127 Anomaly-Detection ML Model — Monday 09:00 SAST weekly
      // model-card expiry sweep. Walks every live champion model with
      // a model_card_expires_at, recomputes days_to_model_card_expiry,
      // flags 14d-out (or already expired) as regulator_relevant +
      // is_reportable so the dashboard surfaces ISO 42001 model-card
      // re-attestation / NIST AI RMF system-card renewal BEFORE the
      // governance committee disables the model. Shared trigger with
      // W122/W123/W124/W125/W126 - no duplicate cron entry in
      // wrangler.toml.
      await safe('anomaly_detection_ml_model_card_expiry_sweep', async () => {
        const result = await anomalyDetectionMlModelCardExpirySweep(env as never);
        console.log('anomaly_detection_ml_model_card_expiry_sweep', JSON.stringify(result));
      });
      // W128 RUL Prediction ML Model — Monday 09:00 SAST weekly
      // model-card expiry sweep. Walks every live champion survival
      // model with a model_card_expires_at, recomputes
      // days_to_model_card_expiry, flags 14d-out (or already expired)
      // as regulator_relevant + is_reportable so the dashboard
      // surfaces ISO 42001 model-card re-attestation / NIST AI RMF
      // system-card renewal BEFORE the governance committee disables
      // the model. Shared trigger with W122/W123/W124/W125/W126/W127
      // - no duplicate cron entry in wrangler.toml.
      await safe('rul_prediction_ml_model_card_expiry_sweep', async () => {
        const result = await rulPredictionMlModelCardExpirySweep(env as never);
        console.log('rul_prediction_ml_model_card_expiry_sweep', JSON.stringify(result));
      });
      // W129 Fault-Fingerprint Multi-Class ML Model — Monday 09:00
      // SAST weekly model-card expiry sweep. Walks every live champion
      // multi-class classifier with a model_card_expires_at,
      // recomputes days_to_model_card_expiry, flags 14d-out (or
      // already expired) as regulator_relevant + is_reportable so the
      // dashboard surfaces ISO 42001 model-card re-attestation / NIST
      // AI RMF system-card renewal BEFORE the governance committee
      // disables the model. Shared trigger with W122/W123/W124/W125/
      // W126/W127/W128 - no duplicate cron entry in wrangler.toml.
      await safe('fault_fingerprint_ml_model_card_expiry_sweep', async () => {
        const result = await faultFingerprintMlModelCardExpirySweep(env as never);
        console.log('fault_fingerprint_ml_model_card_expiry_sweep', JSON.stringify(result));
      });
      // W130 NTT Comparison Battery — Monday 09:00 SAST weekly model-
      // card expiry sweep. Walks every live battery cycle with a
      // model_card_expires_at, recomputes days_to_model_card_expiry,
      // flags 14d-out (or already expired) as regulator_relevant +
      // is_reportable so the dashboard surfaces ISO 42001 re-attestation
      // BEFORE the governance committee disables the comparison cycle.
      // Shared trigger with W122/W123/W124/W125/W126/W127/W128/W129.
      // CLOSES PHASE D weekly footprint.
      await safe('ntt_comparison_battery_model_card_expiry_sweep', async () => {
        const result = await nttComparisonBatteryModelCardExpirySweep(env as never);
        console.log('ntt_comparison_battery_model_card_expiry_sweep', JSON.stringify(result));
      });
      break;

    case '0 6 * * 1':
      // W131 Stage Gates — Monday 08:00 SAST (06:00 UTC) conditions-aging
      // sweep. Walks every gate in conditions_set / decision_recorded /
      // conditions_satisfied / gate_conditional_pass with a conditions_set_at
      // older than 90 days. Flags regulator_relevant = 1 on stale conditions
      // (Equator Principles IV conditions monitoring requirement). Fires
      // stage_gate.conditions_set cascade event with type='condition_stale'.
      // Dedicated 08:00 SAST Monday slot, clear of W127 model-card expiry
      // at 09:00 SAST (0 7 * * 1). PHASE E W1 NEW trigger.
      await safe('stage_gate_conditions_aging_sweep', async () => {
        const result = await stageGateConditionsAgingSweep(env as never);
        console.log('stage_gate_conditions_aging_sweep', JSON.stringify(result));
      });
      break;

    case '15 4 * * *':
      // W130 NTT Comparison Battery — daily 06:15 SAST (04:15 UTC)
      // NIGHTLY CYCLE RUNNER. Walks every live battery cycle, refreshes
      // control/health/days fields (savings_vs_ntt_pct trend,
      // paired_t p-value trend, days_to_next_cycle countdown), flags
      // sustained-below-target counters when savings goes negative OR
      // paired_t p-value >= 0.10, counts cycles near due. NEW trigger -
      // FOURTH (final) Phase-D daily cron, dedicated 45-min-after-W129
      // slot. CLOSES PHASE D daily footprint.
      await safe('ntt_comparison_battery_nightly_cycle_runner', async () => {
        const result = await nttComparisonBatteryNightlyCycleRunner(env as never);
        console.log('ntt_comparison_battery_nightly_cycle_runner', JSON.stringify(result));
      });
      break;

    case '0 1 1 * *':
      // W130 NTT Comparison Battery — monthly 03:00 SAST (01:00 UTC) on
      // 1st-of-month CUMULATIVE SAVINGS LEDGER RECONCILIATION. Validates
      // cumulative_savings_zar against W71 asset-prognostics control
      // savings ledger; if drift exceeds REGULATOR_DIVERSION_DISAGREEMENT_
      // FLOOR_PCT (5%) flags regulator_reportable_diversion + emits an
      // ntt_comparison_battery_audit_published event with the variance
      // payload (catches drift before it surfaces as a Q+1 SARB MA s38
      // notifiable). NEW trigger - monthly Phase-D footprint closer.
      await safe('ntt_comparison_battery_monthly_ledger_reconciliation', async () => {
        const result = await nttComparisonBatteryMonthlyLedgerReconciliation(env as never);
        console.log('ntt_comparison_battery_monthly_ledger_reconciliation', JSON.stringify(result));
      });
      break;

    case '30 2 * * *':
      // W127 Anomaly-Detection ML Model — daily 04:30 SAST (02:30 UTC)
      // drift-scan sweep. Walks every live A/B and champion model,
      // recomputes PSI + KS + recon-error p99 + lift drift signals
      // against the calibrated baseline, flips drift_severity, and
      // raises is_reportable when severity crosses the regulator-
      // reportable threshold. NEW trigger - FIRST Phase-D daily cron,
      // dedicated slot so the heavy multi-tenant drift scan doesn't
      // share airtime with the 02:00 W126 statutory deadline scan.
      await safe('anomaly_detection_ml_drift_scan', async () => {
        const result = await anomalyDetectionMlDriftScan(env as never);
        console.log('anomaly_detection_ml_drift_scan', JSON.stringify(result));
      });
      break;

    case '0 3 * * *':
      // W128 RUL Prediction ML Model — daily 05:00 SAST (03:00 UTC)
      // concordance-monitor sweep. Walks every live A/B and champion
      // survival model, recomputes Harrell C-index + time-dependent
      // AUC + Brier score + Schoenfeld PH-assumption p-value + KM
      // lift vs OLS, flips ph_violated flag when p<0.05, and raises
      // is_reportable when concordance drops below the regulator-
      // reportable threshold OR PH assumption violated on
      // fleet_systemic. NEW trigger - SECOND Phase-D daily cron,
      // dedicated 30-min-after-W127 slot so heavy survival monitor
      // doesn't share airtime with the 02:30 W127 anomaly drift
      // scan or the 02:00 W126 statutory deadline scan.
      await safe('rul_prediction_ml_concordance_monitor', async () => {
        const result = await rulPredictionMlConcordanceMonitor(env as never);
        console.log('rul_prediction_ml_concordance_monitor', JSON.stringify(result));
      });
      break;

    case '30 3 * * *':
      // W129 Fault-Fingerprint Multi-Class ML Model — daily 05:30
      // SAST (03:30 UTC) class-drift scan sweep. Walks every live A/B
      // and champion multi-class classifier, recomputes class-PSI
      // (argmax distribution drift) + per-class confusion drift +
      // novel-class detection rate against the calibrated baseline,
      // flips class_drift_severity, and raises is_reportable when
      // PSI crosses regulator_reportable_misclass threshold OR a
      // previously-unseen fault mode surfaces at fleet_systemic (EU AI
      // Act Art 14 product-class change). NEW trigger - THIRD Phase-D
      // daily cron, dedicated 30-min-after-W128 slot so the heavy
      // multi-class drift scan doesn't share airtime with the 03:00
      // W128 survival concordance monitor or the 02:30 W127 anomaly
      // drift scan.
      await safe('fault_fingerprint_ml_class_drift_scan', async () => {
        const result = await faultFingerprintMlClassDriftScan(env as never);
        console.log('fault_fingerprint_ml_class_drift_scan', JSON.stringify(result));
      });
      break;

    case '0 2 * * *':
      // W126 CIPC / SARS / NERSA government-filing connector — daily
      // 04:00 SAST (02:00 UTC) statutory filing-deadline sweep. Walks
      // every connector with a next_filing_deadline_at, recomputes
      // days_to_next_filing_deadline, and flags connectors with <7 days
      // remaining as regulator_relevant + is_reportable so the morning
      // briefing surfaces CIPC annual return / SARS VAT201 / NERSA
      // quarterly filing deadlines BEFORE statutory lateness penalty
      // kicks in. NEW trigger - third daily cron added for Phase C,
      // closes Phase C cron footprint.
      await safe('government_filing_connector_filing_deadline_sweep', async () => {
        const result = await governmentFilingConnectorFilingDeadlineSweep(env as never);
        console.log('government_filing_connector_filing_deadline_sweep', JSON.stringify(result));
      });
      break;

    case '30 1 * * *':
      // W124 STRATE / SWIFT settlement connector — daily 03:30 SAST
      // (01:30 UTC) reconciliation sweep. Walks every connector in
      // live_settlement_active state, recomputes settlement_quality_index
      // from latency / message_success_rate / break_rate components,
      // refreshes reconciliation aging, and emits cycle_reconciled
      // events for downstream W120 ISO 20022 + W68 counterparty-margin
      // settlement validation. Dedicated daily slot so 15-min SLA sweep
      // stays light. NEW trigger - first daily cron added for Phase C.
      await safe('strate_swift_connector_reconciliation_sweep', async () => {
        const result = await strateSwiftConnectorReconciliationSweep(env as never);
        console.log('strate_swift_connector_reconciliation_sweep', JSON.stringify(result));
      });
      break;

    case '45 1 * * *':
      // W125 SAP / Oracle ERP connector — daily 03:45 SAST (01:45 UTC)
      // period-close reconciliation sweep. Walks every connector in
      // live_posting_active or period_close_reconciled state, recomputes
      // control_effectiveness_index from posting_volume / failure_rate /
      // latency / reconciliation_break_count / SARS/CIPC filing status,
      // refreshes days_to_period_close, and emits
      // sap_oracle_erp_connector_period_close_reconciled events for
      // downstream W124 STRATE/SWIFT settlement + W3 atomic-DvP +
      // W68 counterparty-margin posting validation. Dedicated daily
      // slot 15 min after W124 settlement reconciliation so the GL
      // sees freshly-reconciled settlement totals before posting batch
      // emission. NEW trigger - second daily cron added for Phase C.
      await safe('sap_oracle_erp_connector_reconciliation_sweep', async () => {
        const result = await sapOracleErpConnectorReconciliationSweep(env as never);
        console.log('sap_oracle_erp_connector_reconciliation_sweep', JSON.stringify(result));
      });
      break;

    case '0 15 * * 5':
      // Wave 2 — Friday 17:00 SAST (15:00 UTC) MTD trading-risk digest.
      // One subscription only — antoinette@gonxt.tech — per the 2026-05-27
      // executive decision to drop every other recurring email and keep
      // exactly one weekly oversight cadence. Body summarises this month's
      // worst VaR + scenario losses across all portfolios.
      await safe('risk_mtd_digest', async () => {
        const monthStart = month + '-01';
        const subs = await env.DB.prepare(`
          SELECT * FROM oe_digest_subscriptions
          WHERE enabled = 1 AND digest_type = 'risk_mtd_weekly'
        `).all<any>();
        if (!(subs.results || []).length) return;

        const peakVar = await env.DB.prepare(`
          SELECT v.portfolio_id, p.name AS portfolio_name, v.confidence,
                 MAX(v.var_amount_zar) AS peak_var, MAX(v.es_amount_zar) AS peak_es
          FROM risk_var_results v
          JOIN risk_portfolios p ON p.id = v.portfolio_id
          WHERE v.as_of_date >= ?
          GROUP BY v.portfolio_id, v.confidence
          ORDER BY peak_var DESC LIMIT 10
        `).bind(monthStart).all<any>();

        const worstScenarios = await env.DB.prepare(`
          SELECT sr.scenario_id, s.name AS scenario_name, sr.portfolio_id,
                 p.name AS portfolio_name, MIN(sr.pnl_impact_zar) AS worst_pnl
          FROM risk_scenario_results sr
          JOIN risk_scenarios s ON s.id = sr.scenario_id
          JOIN risk_portfolios p ON p.id = sr.portfolio_id
          WHERE sr.as_of_date >= ?
          GROUP BY sr.scenario_id, sr.portfolio_id
          ORDER BY worst_pnl ASC LIMIT 10
        `).bind(monthStart).all<any>();

        const fmt = (n: number) => `R${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-ZA')}`;
        const varLines = ((peakVar.results || []) as any[]).map(r =>
          `  • ${r.portfolio_name} (VaR ${Math.round(r.confidence * 100)}%): peak ${fmt(r.peak_var)} / ES ${fmt(r.peak_es)}`,
        ).join('\n') || '  (no VaR rows this month)';
        const scnLines = ((worstScenarios.results || []) as any[]).map(r =>
          `  • ${r.scenario_name} on ${r.portfolio_name}: ${fmt(r.worst_pnl)} loss`,
        ).join('\n') || '  (no scenario rows this month)';

        const body = `Open Energy — Trading Risk MTD digest\n` +
          `Month: ${month}\n\n` +
          `Top 10 peak VaR by portfolio × confidence:\n${varLines}\n\n` +
          `Top 10 worst scenario impacts:\n${scnLines}\n\n` +
          `— Open Energy Platform`;

        const status = (env as any).EMAIL_API_KEY ? 'sent' : 'would_send';
        for (const s of (subs.results || []) as any[]) {
          await env.DB.prepare(`
            INSERT INTO oe_digest_deliveries
              (id, subscription_id, channel, destination, status, body_preview, sent_at)
            VALUES (?,?,?,?,?,?,?)
          `).bind(
            `oedd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
            s.id, s.channel, s.destination, status, body.slice(0, 2000),
            status === 'sent' ? new Date().toISOString() : null,
          ).run();
          await env.DB.prepare(`UPDATE oe_digest_subscriptions SET last_sent_at = datetime('now') WHERE id = ?`).bind(s.id).run();
        }
      });
      break;

    case '0 18 * * *':
      // W111 Trader Daily P&L Attribution — T+1 EOD opener fires at 18:00 SAST
      // (16:00 UTC). Walks distinct active books from the last 7 days and
      // creates a fresh day_open row per book per business_date. Skips
      // weekends. This is the dailyP&L cadence anchor — the URGENT SLA polarity
      // (systemic 6h / material 12h / standard 18h / minor 24h) is measured
      // from day_open, so this cron MUST fire before traders/risk start the
      // attribution → review → approve → publish → reconcile → archive
      // workflow on T+1. NEW cron — also registered in wrangler.toml.
      await safe('pnl_attribution_t1_eod_opener', async () => {
        const result = await pnlAttributionT1EodOpener(env as never);
        console.log('pnl_attribution_t1_eod_opener', JSON.stringify(result));
      });
      break;

    case '5 * * * *':
      // Wave 118 - Audit Chain hourly block proposal. Auto-proposes the
      // next hourly platform-wide audit block at 5 past the hour if one
      // has not already been proposed for the current UTC hour. Keeps the
      // tamper-evident ledger ticking even when no admin manually triggers
      // a block. INVERTED-SLA hourly tier = 1h SLA window from
      // block_proposed.
      await safe('audit_chain_hourly_propose_sweep', async () => {
        const result = await auditChainHourlyProposeSweep(env as never);
        console.log('audit_chain_hourly_propose_sweep', JSON.stringify(result));
      });
      break;

    case '0 3 1 1,4,7,10 *':
      // Wave 118 - Audit Chain quarterly NERSA/IPPO/SARB export sweep.
      // On 1 Jan / 1 Apr / 1 Jul / 1 Oct at 03:00 UTC (05:00 SAST), flags
      // every published+reconciled block from the closing quarter
      // is_reportable=1 + regulator_relevant=1, fires
      // audit_chain_quarterly_export_ready cascades. The certified export
      // bundle generation itself ships in W119.
      await safe('audit_chain_quarterly_export_sweep', async () => {
        const result = await auditChainQuarterlyExportSweep(env as never);
        console.log('audit_chain_quarterly_export_sweep', JSON.stringify(result));
      });
      break;

    default:
      // Unknown cron pattern — log so operators notice wrangler.toml drift.
      logger.warn('cron_unknown_pattern', { pattern });
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: HonoEnv['Bindings'], ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env, event.cron));
  },
};
