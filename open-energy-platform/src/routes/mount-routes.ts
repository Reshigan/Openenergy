// All route imports and app.route() mounting in one place.
// index.ts stays thin: create app, apply middleware, call mountRoutes(app), export.
import { Hono } from 'hono';
import { mergePath } from 'hono/utils/url';
import type { HonoEnv } from '../utils/types';

import authRoutes from './auth';
import ssoRoutes from './sso';
import cockpitRoutes from './cockpit';
import pulseRoutes from './pulse';
import launchRoutes from './launch';
import participantsRoutes from './participants';
import contractsRoutes from './contracts';
import invoicesRoutes from './invoices';
import projectsRoutes from './projects';
import docGenerationRoutes from './doc-generation';
import projectScheduleRoutes from './project-schedule';
import riskRoutes from './risk';
import clearingDisclosureRoutes from './clearing-disclosure';
import settlementDvpRoutes from './settlement-dvp';
import marginGateRoutes from './margin-gate';
import tradingRoutes from './trading';
import settlementRoutes from './settlement';
import carbonRoutes from './carbon';
import esgRoutes from './esg';
import esgReportsRoutes from './esg-reports';
import watershedRoutes, { cpPortal as counterpartyPortalRoutes } from './watershed';
import platformRoutes from './platform';
import roleCompletionsRoutes from './role-completions';
import gridRoutes from './grid';
import procurementRoutes from './procurement';
import dealroomRoutes from './dealroom';
import modulesRoutes from './modules';
import popiaRoutes from './popia';
import intelligenceRoutes from './intelligence';
import briefingRoutes from './briefing';
import meteringRoutes from './metering';
import onaRoutes from './ona';
import pipelineRoutes from './pipeline';
import vaultRoutes from './vault';
import threadsRoutes from './threads';
import marketplaceRoutes from './marketplace';
import adminRoutes from './admin';
import supportRoutes from './support';
import aiRoutes from './ai';
import loiRoutes from './lois';
import offtakerRoutes from './offtaker';
import funderRoutes from './funder';
import regulatorRoutes from './regulator';
import regulatorSuiteRoutes from './regulator-suite';
import gridOperatorRoutes from './grid-operator';
import traderRiskRoutes from './trader-risk';
import lenderSuiteRoutes from './lender-suite';
import ippLifecycleRoutes from './ipp-lifecycle';
import offtakerSuiteRoutes from './offtaker-suite';
import carbonRegistryRoutes from './carbon-registry';
import carbonArticle6Routes from './carbon-article-6';
import regulatorInboxRoutes from './regulator-inbox';
import roleActionsRoutes from './role-actions';
import feedRoutes from './feed';
import insightsRoutes from './insights';
import lenderDunningRoutes from './lender-dunning';
import offtakerObligationsRoutes from './offtaker-obligations';
import gridWheelingChargesRoutes from './grid-wheeling-charges';
import traderMmComplianceRoutes from './trader-mm-compliance';
import ippBondsRoutes from './ipp-bonds';
import carbonMrvChainRoutes from './carbon-mrv-chain';
import esumsCommissioningRoutes from './esums-commissioning';
import gridDispatchNominationsRoutes from './grid-dispatch-nominations';
import supportTicketChainRoutes from './support-ticket-chain';
import warrantyClaimChainRoutes from './warranty-claim-chain';
import woChainRoutes from './wo-chain';
import carbonRetirementChainRoutes from './carbon-retirement-chain';
import plannedOutageChainRoutes from './planned-outage-chain';
import procurementChainRoutes from './procurement-chain';
import codChainRoutes from './cod-chain';
import drawdownChainRoutes from './drawdown-chain';
import ppaContractChainRoutes from './ppa-contract-chain';
import insuranceClaimChainRoutes from './insurance-claim-chain';
import prChainRoutes from './pr-chain';
import hseIncidentChainRoutes from './hse-incident-chain';
import cyberIncidentChainRoutes from './cyber-incident-chain';
import edCommitmentChainRoutes from './ed-commitment-chain';
import gcaChainRoutes from './gca-chain';
import poslimitChainRoutes from './poslimit-chain';
import disbursementChainRoutes from './disbursement-chain';
import dispositionChainRoutes from './disposition-chain';
import takeOrPayChainRoutes from './take-or-pay-chain';
import licenceRenewalChainRoutes from './licence-renewal-chain';
import loadCurtailmentChainRoutes from './load-curtailment-chain';
import vendorEscalationChainRoutes from './vendor-escalation-chain';
import bestExecutionChainRoutes from './best-execution-chain';
import carbonRegistrationChainRoutes from './carbon-registration-chain';
import covenantCertificateChainRoutes from './covenant-certificate-chain';
import tariffIndexationChainRoutes from './tariff-indexation-chain';
import complianceInspectionChainRoutes from './compliance-inspection-chain';
import problemManagementChainRoutes from './problem-management-chain';
import carbonReversalChainRoutes from './carbon-reversal-chain';
import tariffDeterminationChainRoutes from './tariff-determination-chain';
import tradeReportingChainRoutes from './trade-reporting-chain';
import loanDefaultChainRoutes from './loan-default-chain';
import curtailmentClaimChainRoutes from './curtailment-claim-chain';
import changeEnablementChainRoutes from './change-enablement-chain';
import carbonOffsetClaimChainRoutes from './carbon-offset-claim-chain';
import licenceApplicationChainRoutes from './licence-application-chain';
import reserveActivationChainRoutes from './reserve-activation-chain';
import availabilityGuaranteeChainRoutes from './availability-guarantee-chain';
import marketAbuseChainRoutes from './market-abuse-chain';
import creditOriginationChainRoutes from './credit-origination-chain';
import paymentSecurityChainRoutes from './payment-security-chain';
import securityRemediationChainRoutes from './security-remediation-chain';
import creditingRenewalChainRoutes from './crediting-renewal-chain';
import ssegRegistrationChainRoutes from './sseg-registration-chain';
import gridCapacityAllocationChainRoutes from './grid-capacity-allocation-chain';
import pmComplianceChainRoutes from './pm-compliance-chain';
import algoCertChainRoutes from './algo-cert-chain';
import loanTransferChainRoutes from './loan-transfer-chain';
import ppaTerminationChainRoutes from './ppa-termination-chain';
import warrantyRecoveryChainRoutes from './warranty-recovery-chain';
import permitToWorkChainRoutes from './permit-to-work-chain';
import carbonErpaChainRoutes from './carbon-erpa-chain';
import complaintResolutionChainRoutes from './complaint-resolution-chain';
import gridCodeComplianceChainRoutes from './grid-code-compliance-chain';
import counterpartyMarginChainRoutes from './counterparty-margin-chain';
import securityPerfectionChainRoutes from './security-perfection-chain';
import recLifecycleChainRoutes from './rec-lifecycle-chain';
import assetPrognosticsChainRoutes from './asset-prognostics-chain';
import sparePartsProvisioningChainRoutes from './spare-parts-provisioning-chain';
import poaCpaInclusionChainRoutes from './poa-cpa-inclusion-chain';
import levyAssessmentChainRoutes from './levy-assessment-chain';
import connectionEnergizationChainRoutes from './connection-energization-chain';
import tradeAllocationChainRoutes from './trade-allocation-chain';
import reserveAccountChainRoutes from './reserve-account-chain';
import ppaChangeInLawChainRoutes from './ppa-change-in-law-chain';
import generationRevenueAssuranceChainRoutes from './generation-revenue-assurance-chain';
import serviceContractChainRoutes from './service-contract-chain';
import projectChangeOrderChainRoutes from './project-change-order-chain';
import carbonIssuanceChainRoutes from './carbon-issuance-chain';
import consultationNoticeChainRoutes from './consultation-notice-chain';
import blackStartChainRoutes from './black-start-chain';
import settlementFailChainRoutes from './settlement-fail-chain';
import dscrMonitoringChainRoutes from './dscr-monitoring-chain';
import ppaNominationChainRoutes from './ppa-nomination-chain';
import bessSohChainRoutes from './bess-soh-chain';
import oemFcoChainRoutes from './oem-fco-chain';
import benchmarkTransitionChainRoutes from './benchmark-transition-chain';
import ccpAssessmentChainRoutes from './ccp-assessment-chain';
import projectRiskChainRoutes from './project-risk-chain';
import enforcementActionChainRoutes from './enforcement-action-chain';
import rezCapacityChainRoutes from './rez-capacity-chain';
import sllKpiChainRoutes from './sll-kpi-chain';
import submittalRfiChainRoutes from './submittal-rfi-chain';
import dfrChainRoutes from './dfr-chain';
import punchListChainRoutes from './punch-list-chain';
import itpChainRoutes from './itp-chain';
import handoverDossierChainRoutes from './handover-dossier-chain';
import ppaAnnualReconChainRoutes from './ppa-annual-recon-chain';
import soilingAuditChainRoutes from './soiling-audit-chain';
import esgDisclosureChainRoutes from './esg-disclosure-chain';
import serviceRequestChainRoutes from './service-request-chain';
import imbalanceSettlementChainRoutes from './imbalance-settlement-chain';
import enforcementActionS35ChainRoutes from './enforcement-action-s35-chain';
import pretradeCreditChainRoutes from './pretrade-credit-chain';
import loanRestructureChainRoutes from './loan-restructure-chain';
import carbonCreditRatingChainRoutes from './carbon-credit-rating-chain';
import transmissionOutageChainRoutes from './transmission-outage-chain';
import pnlAttributionChainRoutes from './pnl-attribution-chain';
import ippScheduleChainRoutes from './ipp-schedule-chain';
import ippEvmChainRoutes from './ipp-evm-chain';
import ippDocumentControlChainRoutes from './ipp-document-control-chain';
import ippSubmittalRoute from './ipp-submittal';
import ippRfiRoute from './ipp-rfi';
import ippChangeOrderRoute from './ipp-change-order';
import auditChainRoute from './audit-chain';
import regulatorExportRoutes from './regulator-export';
import reconciliationAttestationRoutes from './reconciliation-attestation';
import controlEnvironmentAuditRoutes from './control-environment-audit';
import scadaConnectorRoutes from './scada-connector';
import mqttOpcuaConnectorRoutes from './mqtt-opcua-connector';
import strateSwiftConnectorRoutes from './strate-swift-connector';
import sapOracleErpConnectorRoutes from './sap-oracle-erp-connector';
import governmentFilingConnectorRoutes from './government-filing-connector';
import anomalyDetectionMlRoutes from './anomaly-detection-ml';
import rulPredictionMlRoutes from './rul-prediction-ml';
import faultFingerprintMlRoutes from './fault-fingerprint-ml';
import nttComparisonBatteryRoutes from './ntt-comparison-battery';
import stageGateRoutes from './stage-gate';
import ippIssuesRoutes from './ipp-issues';
import ippRiskRoutes from './ipp-risk';
import ippStakeholderRoutes from './ipp-stakeholder';
import ippLessonsLearnedRoutes from './ipp-lessons-learned';
import ippNcrRoutes from './ipp-ncr';
import ippMethodStatementRoutes from './ipp-method-statement';
import ippEnvMonitoringRoutes from './ipp-env-monitoring';
import ippMirRoutes from './ipp-mir';
import ippSubcontractorRoutes from './ipp-subcontractor';
import ippProgressClaimRoutes from './ipp-progress-claim';
import ippTqRoutes from './ipp-tq';
import ippDiaryRoutes from './ipp-diary';
import ippSiteInstructionRoutes from './ipp-site-instruction';
import ippDlpDefectRoutes from './ipp-dlp-defect';
import ippVariationOrderRoutes from './ipp-variation-order';
import ippPaymentCertRoutes from './ipp-payment-cert';
import ippFinalCompletionRoutes from './ipp-final-completion';
import ippOmHandoverRoutes from './ipp-om-handover';
import ippLandRegisterRoutes from './ipp-land-register';
import ippEnvClosureRoutes from './ipp-env-closure';
import ippCommissioningTestRoutes from './ipp-commissioning-test';
import ippIeCertRoutes from './ipp-ie-cert';
import ippTpaRoutes from './ipp-tpa';
import ippPpaVariationRoutes from './ipp-ppa-variation';
import ippChangeOfControlRoutes from './ipp-change-of-control';
import ippRefinancingRoutes from './ipp-refinancing';
import ippFmRoutes from './ipp-fm';
import ippAnnualReportRoutes from './ipp-annual-report';
import ippContractorDefaultRoutes from './ipp-contractor-default';
import ippEcoReportRoutes from './ipp-eco-report';
import ippLtaCertificateRoutes from './ipp-lta-certificate';
import ippLandAmendmentRoutes from './ipp-land-amendment';
import ippCommunityTrustRoutes from './ipp-community-trust';
import ippGridComplianceRoutes from './ipp-grid-compliance';
import ippCccRoutes from './ipp-ccc';
import ippOmContractRoutes from './ipp-om-contract';
import ippBfsRoutes from './ipp-bfs';
import ippEaAmendmentRoutes from './ipp-ea-amendment';
import ippWulRoutes from './ipp-wul';
import ippHraRoutes from './ipp-hra';
import ippAelRoutes from './ipp-ael';
import ippForceMajeureRoutes from './ipp-force-majeure';
import ippLcReportRoutes from './ipp-lc-report';
import ippMilestoneCertRoutes from './ipp-milestone-cert';
import ippEsmrRoutes from './ipp-esmr';
import ippIeAnnualReviewRoutes from './ipp-iear';
import ippInsuranceRenewalRoutes from './ipp-insr';
import ippPerfSecurityRoutes from './ipp-perf-security';
import ippCepComplianceRoutes from './ipp-cep-compliance';
import ippSedComplianceRoutes from './ipp-sed-compliance';
import ippBbbeeVerificationRoutes from './ipp-bbbee-verification';
import ippLenderReportingRoutes from './ipp-lender-reporting';
import ippLicenceReturnsRoutes from './ipp-licence-returns';
import ippReippppReportsRoutes from './ipp-reipppp-reports';
import ippEquityTransferRoutes from './ipp-equity-transfer';
import ippQuarterlyGenReportRoutes from './ipp-quarterly-gen-reports';
import ippAnnualComplianceAssessmentRoutes from './ipp-annual-compliance-assessments';
import ippAnnualAuditRoutes from './ipp-annual-audits';
import ippEmpComplianceReportRoutes from './ipp-emp-compliance-reports';
import ippCpTrackerRoutes from './ipp-cp-tracker';
import ippLicenceObligationRoutes from './ipp-licence-obligations';
import { facilityAmendmentRoutes } from './facility-amendment-chain';
import { esapComplianceRoutes } from './esap-compliance-chain';
import { protectionRelayRoutes } from './protection-relay-chain';
import { unservedEnergyRoutes } from './unserved-energy-chain';
import stationParticipantLinkRoutes from './station-participant-links';
import adminPlatformRoutes from './admin-platform';
import settlementAutoRoutes from './settlement-automation';
import imbalanceRoutes from './imbalance';
import dataTierRoutes from './data-tier';
import aiBriefsRoutes from './ai-briefs';
import realtimeRoutes from './realtime';
import siemRoutes from './siem';
import reportsRoutes from './reports';
import telemetryRoutes from './telemetry';
import monitoringRoutes from './monitoring';
import lookupRoutes from './lookup';
import adminRevenueRoutes from './admin-revenue';
import adminMarketHaltRoutes from './admin-market-halt';
import backupRoutes from './backup';
import searchRoutes from './search';
import notificationsRoutes from './notifications';
import scheduleRoutes from './schedule';
import esumsOmRoutes from './esums-om';
import esumsOmIntelRoutes from './esums-om-intel';
import esumsOmAnalysisRoutes from './esums-om-analysis';
import { portalAdmin as esumsOmPortalAdmin, portalPublic as esumsOmPortalPublic } from './esums-om-portal';
import esumsIngestRoutes from './esums-ingest';
import esumsDataSourcesRoutes from './esums-data-sources';
import esumsProjectsRoutes from './esums-projects';
import esumsOmSolaxRoutes from './esums-solax';
import esumsManufacturersRoutes from './esums-manufacturers';
import esumsAccrualsRoutes, { esumsInvoiceRoutes, esumsCreditRoutes } from './esums-accruals';
import platformFeaturesRoutes from './platform-features';
import onboardingRoutes from './onboarding';
import onboardingChecklistRoutes from './onboarding-checklist';
import onboardingKycRoutes from './onboarding-kyc';
import {
  mfa as mfaRoutes,
  kyc as kycRoutes,
  consent as consentRoutes,
  popia as popiaSelfServiceRoutes,
  regulator as regulatorReportRoutes,
  status as publicStatusRoutes,
} from './go-live';
import authDeepRoutes from './auth-deep';
import kycDeepRoutes from './kyc-deep';
import { admin as statusDeepAdmin, pub as statusDeepPub } from './status-deep';
import popiaDeepRoutes from './popia-deep';
import reportsDeepRoutes from './reports-deep';
import tradingDeepRoutes from './trading-deep';
import settlementDeepRoutes from './settlement-deep';
import { ipp as ippDeepRoutes, lender as lenderDeepRoutes, carbon as carbonDeepRoutes } from './depth-3';
import gridL5Routes from './grid-l5';
import { admin as regulatorL5Admin, pub as regulatorL5Pub } from './regulator-l5';
import tradingClearingL5Routes from './trading-clearing-l5';
import { admin as auditL5Admin, pub as auditL5Pub } from './audit-l5';
import marketplaceL5Routes from './marketplace-l5';
import aiAssistantRoutes from './ai-assistant';
import polishRoutes from './polish';
import publicLegalRoutes from './public-legal';
import businessDepthRoutes from './business-depth';
import bulkOpsRoutes from './bulk-ops';
import uxStateRoutes from './ux-state';
import documentsRoutes from './documents';
import pdfRoutes from './pdf';
import rbacRoutes from './rbac';
import printPacksRoutes from './print-packs';
import kycChainRoutes from './kyc-chain';
import smartMeterChainRoutes from './smart-meter-chain';
import carbonTaxChainRoutes from './carbon-tax-chain';
import fsccChainRoutes from './fsca-compliance-chain';
import greenBondChainRoutes from './green-bond-chain';
import capAdequacyChainRoutes from './capital-adequacy-chain';
import slbKpiChainRoutes from './slb-kpi-chain';
import demandResponseChainRoutes from './demand-response-chain';
import carbonRegistryTransferChainRoutes from './carbon-registry-transfer-chain';
import milestoneVarianceChainRoutes from './milestone-variance-chain';
import csatChainRoutes from './csat-chain';
import publicConsultationChainRoutes from './public-consultation-chain';
import greenTariffChainRoutes from './green-tariff-chain';
import substationAssetChainRoutes from './substation-asset-chain';
import dscrReportChainRoutes from './dscr-report-chain';
import methodologyAmendmentChainRoutes from './methodology-amendment-chain';
import esapMonitoringChainRoutes from './esap-monitoring-chain';
import eopActivationChainRoutes from './eop-activation-chain';
import fscaConductReportChainRoutes from './fsca-conduct-report-chain';
import slaPerformanceReportChainRoutes from './sla-performance-report-chain';
import creditInsuranceChainRoutes from './credit-insurance-chain';
import wheelingAccessChainRoutes from './wheeling-access-chain';
import marketConductExamChainRoutes from './market-conduct-exam-chain';
import exportCurtailmentChainRoutes from './export-curtailment-chain';
import crossBorderTradeChainRoutes from './cross-border-trade-chain';
import cpClearanceChainRoutes from './cp-clearance-chain';
import gtiaChainRoutes from './gtia-chain';
import scope3DisclosureChainRoutes from './scope3-disclosure-chain';
import vcmProjectDevelopmentChainRoutes from './vcm-project-development-chain';
import carbonBudgetChainRoutes from './carbon-budget-chain';
import recDeviceRegistrationChainRoutes from './rec-device-registration-chain';
import recIssuanceChainRoutes from './rec-issuance-chain';
import vcmOrderBookRoutes from './vcm-order-book';
import sustainabilityMarketplaceRoutes from './sustainability-marketplace';
import sustainabilityTransactionChainRoutes from './sustainability-transaction-chain';
import certBundleChainRoutes from './certificate-bundle-chain';
import subscriptionBillingChainRoutes from './subscription-billing-chain';
import virtualPpaSettlementChainRoutes from './virtual-ppa-settlement-chain';
import cbtSedChainRoutes from './cbt-sed-chain';
import constructionCostReportChainRoutes from './construction-cost-report-chain';
import isdaAgreementChainRoutes from './isda-agreement-chain';
import dataSubjectRequestChainRoutes from './data-subject-request-chain';
import interconnectorScheduleChainRoutes from './interconnector-schedule-chain';
import nationalDashboardRoutes from './national-dashboard';
import horizonRoutes from './horizon';
import threadRoutes from './thread';
import ledgerRoutes from './ledger';
import dealsRoutes from './deals';

// Hono's authMiddleware is applied per-module inside each route file using
// r.use('*', authMiddleware). This function only mounts the paths.

// RouteInfo mirrors Hono's internal RouterRoute shape (method/path/basePath).
type RouteInfo = { method: string; path: string; basePath: string };

// P1 guard: Hono's app.route() is additive — mounting two modules under the
// same prefix silently merges their sub-paths and the FIRST registered handler
// wins for any true (method, path) collision. Walk each module's own route
// table BEFORE merging (so we still know which module owns which route) and
// fail fast at boot if two distinct modules register the same concrete
// (method, path). ALL (middleware) overlaps and prefix-only re-mounts only
// WARN — those are intentional extension patterns, not shadows.

// Known-intentional cross-module (method, path) overlaps. These are
// feature-modules that extend a base module's sub-paths AND contribute other
// unique sub-paths, so unmounting them would lose live routes. The base
// module (mounted first) wins the overlap; the duplicate handler in the
// feature-module is dead and should be deduped by that module's owner.
// Format: `${method} ${effectivePath}` → reason.
const KNOWN_CROSS_MODULE_SHADOWS = new Map<string, string>([
  // /api/popia mounted twice: src/routes/popia.ts (base, mounted first) and
  // src/routes/go-live.ts `popia` (feature-module). go-live also contributes
  // /requests, /export, /export/:id/download, /erasure/:id/cancel — unmounting
  // it loses those. go-live's POST /erasure is shadowed by base popia's
  // POST /erasure. TODO(go-live owner): drop the redundant /erasure in go-live.
  ['POST /api/popia/erasure', 'go-live popia feature-module extends base popia; base wins /erasure'],
]);

export function assertNoRouteShadow(mounts: Array<[string, Hono<HonoEnv>]>): void {
  // key -> Set<moduleIndex>  (distinct modules registering this (method, path))
  const owners = new Map<string, Set<number>>();
  for (let i = 0; i < mounts.length; i++) {
    const [prefix, mod] = mounts[i];
    const routes = (mod as unknown as { routes?: RouteInfo[] }).routes ?? [];
    for (const r of routes) {
      const effPath = mergePath(prefix, r.path);
      const key = `${r.method} ${effPath}`;
      const set = owners.get(key);
      if (set) set.add(i);
      else owners.set(key, new Set([i]));
    }
  }

  const warnings: string[] = [];
  const failures: string[] = [];
  for (const [key, set] of owners) {
    if (set.size < 2) continue; // single module — within-module dups are out of scope here
    const method = key.split(' ')[0];
    if (method === 'ALL') {
      // Middleware overlap from multiple modules under the same prefix.
      // Additive by design (each module's r.use('*', mw) chains). WARN only.
      warnings.push(`WARN  ${key}  middleware registered by ${set.size} modules`);
    } else {
      // Cross-module concrete-method collision: first registered silently wins.
      const known = KNOWN_CROSS_MODULE_SHADOWS.get(key);
      if (known) {
        warnings.push(`WARN  ${key}  known-intentional shadow (${set.size} modules): ${known}`);
      } else {
        failures.push(`FAIL  ${key}  registered by ${set.size} modules (first wins silently)`);
      }
    }
  }

  // Prefix-only re-mount WARN — same prefix mounted multiple times.
  const prefixCounts = new Map<string, number>();
  for (const [prefix] of mounts) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  for (const [prefix, n] of prefixCounts) {
    if (n > 1) warnings.push(`WARN  prefix ${prefix} mounted ${n}x`);
  }

  for (const w of warnings) console.warn(w);
  if (failures.length) {
    throw new Error(
      `route shadowing detected: ${failures.length} cross-module (method, path) collision(s) — first registered handler wins silently:\n` +
        failures.join('\n'),
    );
  }
}

export function mountRoutes(app: Hono<HonoEnv>): void {
  // Record each (prefix, module) pair so assertNoRouteShadow can detect
  // cross-module (method, path) collisions before Hono silently merges them.
  const mounts: Array<[string, Hono<HonoEnv>]> = [];
  const mount = (prefix: string, mod: Hono<HonoEnv>): void => {
    mounts.push([prefix, mod]);
    app.route(prefix, mod);
  };

  // Auth routes
  mount('/api/auth', authRoutes);
  mount('/api/auth/sso', ssoRoutes);
  mount('/api/cockpit', cockpitRoutes);
  mount('/api/pulse', pulseRoutes);
  mount('/api/launch', launchRoutes);

  // Protected routes
  mount('/api/participants', participantsRoutes);
  mount('/api/contracts', contractsRoutes);
  mount('/api/invoices', invoicesRoutes);
  mount('/api/projects', projectsRoutes);
  mount('/api/doc-gen', docGenerationRoutes);
  mount('/api/projects/:projectId/schedule', projectScheduleRoutes);
  mount('/api/risk', riskRoutes);
  mount('/api/clearing/disclosure', clearingDisclosureRoutes);
  mount('/api/settlement/dvp', settlementDvpRoutes);
  mount('/api/clearing/margin-gate', marginGateRoutes);
  mount('/api/trading', tradingRoutes);
  mount('/api/role-actions', roleActionsRoutes);
  mount('/api/feed', feedRoutes);
  mount('/api/insights', insightsRoutes);
  mount('/api/settlement', settlementRoutes);
  mount('/api/carbon', carbonRoutes);
  mount('/api/esg', esgRoutes);
  mount('/api/esg-reports', esgReportsRoutes);
  mount('/api/watershed', watershedRoutes);
  mount('/api/portal', counterpartyPortalRoutes);
  mount('/api/platform', platformRoutes);
  mount('/api/roles', roleCompletionsRoutes);
  mount('/api/grid', gridRoutes);
  mount('/api/procurement', procurementRoutes);
  mount('/api/dealroom', dealroomRoutes);
  mount('/api/modules', modulesRoutes);
  mount('/api/popia', popiaRoutes);
  mount('/api/intelligence', intelligenceRoutes);
  mount('/api/briefing', briefingRoutes);
  mount('/api/metering', meteringRoutes);
  mount('/api/ona', onaRoutes);
  mount('/api/pipeline', pipelineRoutes);
  mount('/api/vault', vaultRoutes);
  mount('/api/threads', threadsRoutes);
  mount('/api/marketplace', marketplaceRoutes);
  mount('/api/admin', adminRoutes);
  mount('/api/support', supportRoutes);
  mount('/api/ai', aiRoutes);
  mount('/api/lois', loiRoutes);
  mount('/api/offtaker', offtakerRoutes);
  mount('/api/funder', funderRoutes);
  // /api/regulator is intentionally mounted three times (lines below + line ~650):
  //   regulatorRoutes      → /filings, /market-summary
  //   regulatorSuiteRoutes → /licences, /tariff-submissions
  //   regulatorReportRoutes (reports.ts) → /catalog, /ledger, /registry, /:role
  // Hono matches in registration order; the /:role wildcard in reports only fires
  // for paths not claimed by the first two routers. No conflicts verified.
  mount('/api/regulator', regulatorRoutes);
  mount('/api/regulator', regulatorSuiteRoutes);
  mount('/api/grid-operator', gridOperatorRoutes);
  mount('/api/trader-risk', traderRiskRoutes);
  mount('/api/lender', lenderSuiteRoutes);
  mount('/api/ipp', ippLifecycleRoutes);
  mount('/api/offtaker-suite', offtakerSuiteRoutes);
  mount('/api/carbon-registry', carbonRegistryRoutes);
  mount('/api/carbon/article-6', carbonArticle6Routes);
  mount('/api/regulator/inbox', regulatorInboxRoutes);
  mount('/api/lender/dunning', lenderDunningRoutes);
  mount('/api/offtaker/obligations', offtakerObligationsRoutes);
  mount('/api/grid/wheeling-charges', gridWheelingChargesRoutes);
  mount('/api/trader/mm-compliance', traderMmComplianceRoutes);
  mount('/api/ipp/bonds', ippBondsRoutes);
  mount('/api/carbon/mrv-chain', carbonMrvChainRoutes);
  mount('/api/esums/commissioning', esumsCommissioningRoutes);
  mount('/api/grid/dispatch-nominations', gridDispatchNominationsRoutes);
  mount('/api/support/ticket-chain', supportTicketChainRoutes);
  mount('/api/esums/warranty-claims', warrantyClaimChainRoutes);
  mount('/api/esums/wo-chain', woChainRoutes);
  mount('/api/carbon/retirement-chain', carbonRetirementChainRoutes);
  mount('/api/grid/planned-outages', plannedOutageChainRoutes);
  mount('/api/ipp/procurement-chain', procurementChainRoutes);
  mount('/api/ipp/cod-chain', codChainRoutes);
  mount('/api/lender/drawdown-chain', drawdownChainRoutes);
  mount('/api/offtaker/ppa-contract-chain', ppaContractChainRoutes);
  mount('/api/insurance/claim-chain', insuranceClaimChainRoutes);
  mount('/api/esums/pr-chain', prChainRoutes);
  mount('/api/hse/incident-chain', hseIncidentChainRoutes);
  mount('/api/cyber/incident-chain', cyberIncidentChainRoutes);
  mount('/api/ed/commitment-chain', edCommitmentChainRoutes);
  mount('/api/gca/connection-chain', gcaChainRoutes);
  mount('/api/poslimit/chain', poslimitChainRoutes);
  mount('/api/disbursement/chain', disbursementChainRoutes);
  mount('/api/disposition/chain', dispositionChainRoutes);
  mount('/api/take-or-pay/chain', takeOrPayChainRoutes);
  mount('/api/licence/renewal/chain', licenceRenewalChainRoutes);
  mount('/api/load-curtailment/chain', loadCurtailmentChainRoutes);
  mount('/api/esums/vendor-escalation/chain', vendorEscalationChainRoutes);
  mount('/api/best-execution/chain', bestExecutionChainRoutes);
  mount('/api/carbon-registration/chain', carbonRegistrationChainRoutes);
  mount('/api/covenant-certificate/chain', covenantCertificateChainRoutes);
  mount('/api/tariff-indexation/chain', tariffIndexationChainRoutes);
  mount('/api/compliance-inspection/chain', complianceInspectionChainRoutes);
  mount('/api/problem-management/chain', problemManagementChainRoutes);
  mount('/api/carbon-reversal/chain', carbonReversalChainRoutes);
  mount('/api/tariff-determination/chain', tariffDeterminationChainRoutes);
  mount('/api/trade-reporting/chain', tradeReportingChainRoutes);
  mount('/api/loan-default/chain', loanDefaultChainRoutes);
  mount('/api/curtailment-claim/chain', curtailmentClaimChainRoutes);
  mount('/api/change-enablement/chain', changeEnablementChainRoutes);
  mount('/api/carbon-offset-claim/chain', carbonOffsetClaimChainRoutes);
  mount('/api/licence-application/chain', licenceApplicationChainRoutes);
  mount('/api/reserve-activation/chain', reserveActivationChainRoutes);
  mount('/api/availability-guarantee/chain', availabilityGuaranteeChainRoutes);
  mount('/api/market-abuse/chain', marketAbuseChainRoutes);
  mount('/api/credit-origination/chain', creditOriginationChainRoutes);
  mount('/api/payment-security/chain', paymentSecurityChainRoutes);
  mount('/api/security-remediation/chain', securityRemediationChainRoutes);
  mount('/api/crediting-renewal/chain', creditingRenewalChainRoutes);
  mount('/api/sseg-registration/chain', ssegRegistrationChainRoutes);
  mount('/api/grid-capacity/chain', gridCapacityAllocationChainRoutes);
  mount('/api/pm-compliance/chain', pmComplianceChainRoutes);
  mount('/api/algo-cert/chain', algoCertChainRoutes);
  mount('/api/loan-transfer/chain', loanTransferChainRoutes);
  mount('/api/ppa-termination/chain', ppaTerminationChainRoutes);
  mount('/api/warranty-recovery/chain', warrantyRecoveryChainRoutes);
  mount('/api/permit-to-work/chain', permitToWorkChainRoutes);
  mount('/api/carbon-erpa/chain', carbonErpaChainRoutes);
  mount('/api/complaints/chain', complaintResolutionChainRoutes);
  mount('/api/grid-code-compliance/chain', gridCodeComplianceChainRoutes);
  mount('/api/counterparty-margin/chain', counterpartyMarginChainRoutes);
  mount('/api/security-perfection/chain', securityPerfectionChainRoutes);
  mount('/api/rec-lifecycle/chain', recLifecycleChainRoutes);
  mount('/api/asset-prognostics/chain', assetPrognosticsChainRoutes);
  mount('/api/spare-parts-provisioning/chain', sparePartsProvisioningChainRoutes);
  mount('/api/poa-inclusion/chain', poaCpaInclusionChainRoutes);
  mount('/api/levy-assessment/chain', levyAssessmentChainRoutes);
  mount('/api/connection-energization/chain', connectionEnergizationChainRoutes);
  mount('/api/trade-allocation/chain', tradeAllocationChainRoutes);
  mount('/api/reserve-account/chain', reserveAccountChainRoutes);
  mount('/api/ppa-change-in-law/chain', ppaChangeInLawChainRoutes);
  mount('/api/generation-revenue-assurance/chain', generationRevenueAssuranceChainRoutes);
  mount('/api/service-contract/chain', serviceContractChainRoutes);
  mount('/api/ipp/change-order/chain', projectChangeOrderChainRoutes);
  mount('/api/carbon-issuance/chain', carbonIssuanceChainRoutes);
  mount('/api/consultation-notice/chain', consultationNoticeChainRoutes);
  mount('/api/black-start/chain', blackStartChainRoutes);
  mount('/api/settlement-fail/chain', settlementFailChainRoutes);
  mount('/api/dscr-monitoring/chain', dscrMonitoringChainRoutes);
  mount('/api/ppa-nomination/chain', ppaNominationChainRoutes);
  mount('/api/bess-soh/chain', bessSohChainRoutes);
  mount('/api/oem-fco/chain', oemFcoChainRoutes);
  mount('/api/benchmark-transition/chain', benchmarkTransitionChainRoutes);
  mount('/api/ccp-assessment/chain', ccpAssessmentChainRoutes);
  mount('/api/ipp/project-risk/chain', projectRiskChainRoutes);
  mount('/api/regulator/enforcement-action/chain', enforcementActionChainRoutes);
  mount('/api/grid/rez-capacity/chain', rezCapacityChainRoutes);
  mount('/api/lender/sll-kpi/chain', sllKpiChainRoutes);
  mount('/api/ipp/submittal-rfi/chain', submittalRfiChainRoutes);
  mount('/api/ipp/dfr/chain', dfrChainRoutes);
  mount('/api/ipp/punch-list/chain', punchListChainRoutes);
  mount('/api/ipp/itp/chain', itpChainRoutes);
  mount('/api/ipp/handover-dossier/chain', handoverDossierChainRoutes);
  mount('/api/offtaker/ppa-annual-recon/chain', ppaAnnualReconChainRoutes);
  mount('/api/esums/soiling-audit/chain', soilingAuditChainRoutes);
  mount('/api/carbon/esg-disclosure/chain', esgDisclosureChainRoutes);
  mount('/api/support/service-request/chain', serviceRequestChainRoutes);
  mount('/api/grid/imbalance-settlement/chain', imbalanceSettlementChainRoutes);
  mount('/api/regulator/enforcement-action-s35/chain', enforcementActionS35ChainRoutes);
  mount('/api/trader/pretrade-credit/chain', pretradeCreditChainRoutes);
  mount('/api/lender/loan-restructure/chain', loanRestructureChainRoutes);
  mount('/api/carbon/credit-rating/chain', carbonCreditRatingChainRoutes);
  mount('/api/grid/transmission-outage/chain', transmissionOutageChainRoutes);
  mount('/api/trader/pnl-attribution/chain', pnlAttributionChainRoutes);
  mount('/api/ipp/wbs-schedule/chain', ippScheduleChainRoutes);
  mount('/api/ipp/cost-evm/chain', ippEvmChainRoutes);
  mount('/api/ipp/document-control/chain', ippDocumentControlChainRoutes);
  mount('/api/ipp/submittals/chain', ippSubmittalRoute);
  mount('/api/ipp/rfis/chain', ippRfiRoute);
  mount('/api/ipp/change-orders/chain', ippChangeOrderRoute);
  mount('/api/audit-chain', auditChainRoute);
  mount('/api/regulator-exports', regulatorExportRoutes);
  mount('/api/reconciliation-attestation', reconciliationAttestationRoutes);
  mount('/api/control-environment-audit', controlEnvironmentAuditRoutes);
  mount('/api/scada-connector', scadaConnectorRoutes);
  mount('/api/mqtt-opcua-connector', mqttOpcuaConnectorRoutes);
  mount('/api/strate-swift-connector', strateSwiftConnectorRoutes);
  mount('/api/sap-oracle-erp-connector', sapOracleErpConnectorRoutes);
  mount('/api/government-filing-connector', governmentFilingConnectorRoutes);
  mount('/api/anomaly-detection-ml', anomalyDetectionMlRoutes);
  mount('/api/rul-prediction-ml', rulPredictionMlRoutes);
  mount('/api/fault-fingerprint-ml', faultFingerprintMlRoutes);
  mount('/api/ntt-comparison-battery', nttComparisonBatteryRoutes);
  mount('/api/stage-gate', stageGateRoutes);
  mount('/api/ipp-issues', ippIssuesRoutes);
  mount('/api/ipp-risk', ippRiskRoutes);
  mount('/api/ipp-stakeholder', ippStakeholderRoutes);
  mount('/api/ipp-lessons-learned', ippLessonsLearnedRoutes);
  mount('/api/ipp-ncr', ippNcrRoutes);
  mount('/api/ipp-method-statement', ippMethodStatementRoutes);
  mount('/api/ipp-env-monitoring', ippEnvMonitoringRoutes);
  mount('/api/ipp-mir', ippMirRoutes);
  mount('/api/ipp-subcontractor', ippSubcontractorRoutes);
  mount('/api/ipp-progress-claim', ippProgressClaimRoutes);
  mount('/api/ipp-tq', ippTqRoutes);
  mount('/api/ipp-diary', ippDiaryRoutes);
  mount('/api/ipp-site-instruction', ippSiteInstructionRoutes);
  mount('/api/ipp-dlp-defect', ippDlpDefectRoutes);
  mount('/api/ipp-variation-order', ippVariationOrderRoutes);
  mount('/api/ipp-payment-cert', ippPaymentCertRoutes);
  mount('/api/ipp-final-completion', ippFinalCompletionRoutes);
  mount('/api/ipp-om-handover', ippOmHandoverRoutes);
  mount('/api/ipp-land-register', ippLandRegisterRoutes);
  mount('/api/ipp-env-closure', ippEnvClosureRoutes);
  mount('/api/ipp-commissioning-test', ippCommissioningTestRoutes);
  mount('/api/ipp-ie-cert', ippIeCertRoutes);
  mount('/api/ipp-tpa', ippTpaRoutes);
  mount('/api/ipp-ppa-variation', ippPpaVariationRoutes);
  mount('/api/ipp-change-of-control', ippChangeOfControlRoutes);
  mount('/api/ipp-refinancing', ippRefinancingRoutes);
  mount('/api/ipp-fm', ippFmRoutes);
  mount('/api/ipp-annual-report', ippAnnualReportRoutes);
  mount('/api/ipp-contractor-default', ippContractorDefaultRoutes);
  mount('/api/ipp-eco-report', ippEcoReportRoutes);
  mount('/api/ipp-lta-certificate', ippLtaCertificateRoutes);
  mount('/api/ipp-land-amendment', ippLandAmendmentRoutes);
  mount('/api/ipp-community-trust', ippCommunityTrustRoutes);
  mount('/api/ipp-grid-compliance', ippGridComplianceRoutes);
  mount('/api/ipp-ccc', ippCccRoutes);
  mount('/api/ipp-om-contract', ippOmContractRoutes);
  mount('/api/ipp-bfs', ippBfsRoutes);
  mount('/api/ipp-ea-amendment', ippEaAmendmentRoutes);
  mount('/api/ipp-wul', ippWulRoutes);
  mount('/api/ipp-hra', ippHraRoutes);
  mount('/api/ipp-ael', ippAelRoutes);
  mount('/api/ipp-force-majeure', ippForceMajeureRoutes);
  mount('/api/ipp-lc-reports', ippLcReportRoutes);
  mount('/api/ipp-milestone-certs', ippMilestoneCertRoutes);
  mount('/api/ipp-esmr', ippEsmrRoutes);
  mount('/api/ipp-ie-annual-reviews', ippIeAnnualReviewRoutes);
  mount('/api/ipp-insurance-renewals', ippInsuranceRenewalRoutes);
  mount('/api/ipp-perf-securities', ippPerfSecurityRoutes);
  mount('/api/ipp-cep-compliance', ippCepComplianceRoutes);
  mount('/api/ipp-sed-compliance', ippSedComplianceRoutes);
  mount('/api/ipp-bbbee-verification', ippBbbeeVerificationRoutes);
  mount('/api/ipp-lender-reporting', ippLenderReportingRoutes);
  mount('/api/ipp-licence-returns', ippLicenceReturnsRoutes);
  mount('/api/ipp-reipppp-reports', ippReippppReportsRoutes);
  mount('/api/ipp-equity-transfer', ippEquityTransferRoutes);
  mount('/api/ipp-quarterly-gen-reports', ippQuarterlyGenReportRoutes);
  mount('/api/ipp-annual-compliance-assessments', ippAnnualComplianceAssessmentRoutes);
  mount('/api/ipp-annual-audits', ippAnnualAuditRoutes);
  mount('/api/ipp-emp-compliance-reports', ippEmpComplianceReportRoutes);
  mount('/api/ipp-cp-tracker', ippCpTrackerRoutes);
  mount('/api/ipp-licence-obligations', ippLicenceObligationRoutes);
  mount('/api/facility-amendments', facilityAmendmentRoutes);
  mount('/api/esap-compliance', esapComplianceRoutes);
  mount('/api/protection-relay-tests', protectionRelayRoutes);
  mount('/api/unserved-energy-claims', unservedEnergyRoutes);
  mount('/api/station-participant-links', stationParticipantLinkRoutes);
  mount('/api/admin-platform', adminPlatformRoutes);
  mount('/api/settlement-auto', settlementAutoRoutes);
  mount('/api/imbalance', imbalanceRoutes);
  mount('/api/data-tier', dataTierRoutes);
  mount('/api/ai-briefs', aiBriefsRoutes);
  mount('/api/realtime', realtimeRoutes);
  mount('/api/siem', siemRoutes);
  mount('/api/reports', reportsRoutes);
  mount('/api/telemetry', telemetryRoutes);
  mount('/api/lookup', lookupRoutes);
  mount('/api/admin/monitoring', monitoringRoutes);
  mount('/api/admin/revenue', adminRevenueRoutes);
  mount('/api/admin/market-halt', adminMarketHaltRoutes);
  // Backup routes are deliberately mounted outside /api/admin to avoid being
  // shadowed by the admin sub-app's global authMiddleware.
  mount('/api/backup', backupRoutes);
  mount('/api/search', searchRoutes);
  mount('/api/notifications', notificationsRoutes);
  mount('/api/schedule', scheduleRoutes);
  mount('/api/esums-portal-view', esumsOmPortalPublic);
  mount('/api/esums-portal', esumsOmPortalAdmin);
  // Native device ingestion (per-site opaque ingest keys, NO user JWT).
  mount('/api/esums-ingest', esumsIngestRoutes);
  mount('/api/esums', esumsOmRoutes);
  mount('/api/esums', esumsOmIntelRoutes);
  mount('/api/esums', esumsOmAnalysisRoutes);
  mount('/api/esums/data-sources', esumsDataSourcesRoutes);
  mount('/api/esums/projects', esumsProjectsRoutes);
  mount('/api/esums/solax', esumsOmSolaxRoutes);
  mount('/api/esums/manufacturers', esumsManufacturersRoutes);
  mount('/api/esums/accruals', esumsAccrualsRoutes);
  mount('/api/esums/settlement-invoices', esumsInvoiceRoutes);
  mount('/api/esums/carbon-credits', esumsCreditRoutes);
  // Public status page MUST be mounted BEFORE the catch-all platform router.
  mount('/api/public/status', publicStatusRoutes);
  mount('/api/public/status', statusDeepPub);
  mount('/api/public/regulator', regulatorL5Pub);
  mount('/api/public/audit',     auditL5Pub);
  mount('/api/public/legal',     publicLegalRoutes);
  // Must be BEFORE /api (platformFeaturesRoutes) which has a blanket authMiddleware.
  mount('/api/pdf',  pdfRoutes);
  mount('/api/rbac', rbacRoutes);
  mount('/api/mfa',         mfaRoutes);
  mount('/api/kyc',         kycRoutes);
  mount('/api/consent',     consentRoutes);
  mount('/api/popia',       popiaSelfServiceRoutes);
  mount('/api/regulator',   regulatorReportRoutes);
  // Depth additions
  mount('/api/auth-deep',     authDeepRoutes);
  mount('/api/kyc-deep',      kycDeepRoutes);
  mount('/api/status-admin',  statusDeepAdmin);
  mount('/api/popia-deep',    popiaDeepRoutes);
  mount('/api/reports-deep',  reportsDeepRoutes);
  mount('/api/trading-deep',    tradingDeepRoutes);
  mount('/api/settlement-deep', settlementDeepRoutes);
  mount('/api/ipp-deep',        ippDeepRoutes);
  mount('/api/lender-deep',     lenderDeepRoutes);
  mount('/api/carbon-deep',     carbonDeepRoutes);
  mount('/api/grid-l5',         gridL5Routes);
  mount('/api/regulator-l5',    regulatorL5Admin);
  mount('/api/trading-clearing-l5', tradingClearingL5Routes);
  mount('/api/audit-l5',            auditL5Admin);
  mount('/api/marketplace-l5',      marketplaceL5Routes);
  mount('/api/ai-assistant',        aiAssistantRoutes);
  mount('/api/polish',              polishRoutes);
  mount('/api/business-depth',      businessDepthRoutes);
  mount('/api/bulk',                bulkOpsRoutes);
  mount('/api/ux-state',            uxStateRoutes);
  mount('/api/documents',           documentsRoutes);
  mount('/api/print-packs',         printPacksRoutes);
  mount('/api/onboarding', onboardingRoutes);
  mount('/api/onboarding', onboardingChecklistRoutes);
  // Full static basePath so the /kyc segment wins over any /:param route in the
  // sibling onboarding routers (Hono silent-collision risk - deliberate).
  mount('/api/onboarding/kyc', onboardingKycRoutes);
  mount('/api/kyc-verifications', kycChainRoutes);
  mount('/api/smart-meter-assets', smartMeterChainRoutes);
  mount('/api/carbon-tax-returns', carbonTaxChainRoutes);
  mount('/api/fsca-compliance-reports', fsccChainRoutes);
  mount('/api/green-bond-reports', greenBondChainRoutes);
  mount('/api/capital-adequacy-reports', capAdequacyChainRoutes);
  mount('/api/slb-kpi-ratchets', slbKpiChainRoutes);
  mount('/api/demand-response-events', demandResponseChainRoutes);
  mount('/api/carbon-registry-transfers', carbonRegistryTransferChainRoutes);
  mount('/api/milestone-variance-reports', milestoneVarianceChainRoutes);
  mount('/api/csat-records', csatChainRoutes);
  mount('/api/public-consultations', publicConsultationChainRoutes);
  mount('/api/green-tariff-disclosures', greenTariffChainRoutes);
  mount('/api/substation-assets', substationAssetChainRoutes);
  mount('/api/dscr-reports', dscrReportChainRoutes);
  mount('/api/methodology-amendments', methodologyAmendmentChainRoutes);
  mount('/api/esap-monitoring', esapMonitoringChainRoutes);
  mount('/api/eop-activations', eopActivationChainRoutes);
  mount('/api/fsca-conduct-reports', fscaConductReportChainRoutes);
  mount('/api/sla-performance-reports', slaPerformanceReportChainRoutes);
  mount('/api/credit-insurance', creditInsuranceChainRoutes);
  mount('/api/wheeling-access', wheelingAccessChainRoutes);
  mount('/api/market-conduct-exams', marketConductExamChainRoutes);
  mount('/api/export-curtailments', exportCurtailmentChainRoutes);
  mount('/api/cross-border-trades', crossBorderTradeChainRoutes);
  mount('/api/cp-clearances', cpClearanceChainRoutes);
  mount('/api/gtia', gtiaChainRoutes);
  mount('/api/carbon/scope3-disclosure/chain', scope3DisclosureChainRoutes);
  mount('/api/carbon/vcm-projects', vcmProjectDevelopmentChainRoutes);
  mount('/api/carbon/budget', carbonBudgetChainRoutes);
  mount('/api/rec/device-registration', recDeviceRegistrationChainRoutes);
  mount('/api/rec/issuance', recIssuanceChainRoutes);
  mount('/api/vcm/order-book', vcmOrderBookRoutes);
  mount('/api/sustainability/marketplace', sustainabilityMarketplaceRoutes);
  mount('/api/sustainability/transactions', sustainabilityTransactionChainRoutes);
  mount('/api/certificate-track/bundle', certBundleChainRoutes);
  mount('/api/subscription/billing', subscriptionBillingChainRoutes);
  mount('/api/offtaker/virtual-ppa-settlement', virtualPpaSettlementChainRoutes);
  mount('/api/ipp/cbt-sed', cbtSedChainRoutes);
  mount('/api/lender/construction-cost-report', constructionCostReportChainRoutes);
  mount('/api/trader/isda-agreement', isdaAgreementChainRoutes);
  mount('/api/admin/dsr', dataSubjectRequestChainRoutes);
  mount('/api/grid/interconnector-schedule', interconnectorScheduleChainRoutes);
  // W7 National Dashboard — operator-only platform-wide aggregate view.
  mount('/api/national-dashboard', nationalDashboardRoutes);
  // Meridian — computed per-role workspace aggregator over chain registry.
  mount('/api/horizon', horizonRoutes);
  // Meridian — generic two-sided case view over chain registry.
  mount('/api/thread', threadRoutes);
  // Meridian — generic per-chain list (KPI + filters + rows) over chain registry.
  mount('/api/ledger', ledgerRoutes);
  // Generalized cross-role deal engine (offer→match→evaluate→accept→track).
  // A specific prefix must be registered BEFORE the broad /api catch-all so
  // Hono (which matches in registration order) routes it correctly.
  mount('/api/deals', dealsRoutes);

  // platformFeaturesRoutes is the catch-all for /api — it must remain LAST.
  mount('/api', platformFeaturesRoutes);

  // P1: fail fast at boot if two distinct modules shadow the same (method, path).
  assertNoRouteShadow(mounts);
}
