// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import type { DurableObjectNamespace, ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { idempotency } from './middleware/idempotency';
import { optionalAuth, authMiddleware, getCurrentUser } from './middleware/auth';
import { tenantQuotaMiddleware } from './middleware/tenant-quota';
import { AppError } from './utils/types';
import { HonoEnv } from './utils/types';

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
import { runFaultEngine } from './utils/esums-fault-engine';
import platformFeaturesRoutes from './routes/platform-features';
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
import { fireCascade } from './utils/cascade';
import { computeDisclosure, evaluateBreaches } from './utils/disclosure';
import printPacksRoutes from './routes/print-packs';

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
  const checks: Record<string, { ok: boolean; latency_ms: number; error?: string }> = {};

  async function probe<T>(name: string, fn: () => Promise<T>): Promise<void> {
    const t = Date.now();
    try {
      await fn();
      checks[name] = { ok: true, latency_ms: Date.now() - t };
    } catch (err) {
      checks[name] = { ok: false, latency_ms: Date.now() - t, error: (err as Error).message };
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

  const allOk = Object.values(checks).every((c) => c.ok || c.error === 'binding_absent');
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
// Public status page MUST be mounted BEFORE the catch-all platform router.
// platformFeaturesRoutes is mounted at /api and applies authMiddleware to
// every request that passes through it, including those that don't match
// a route inside the sub-app — so order matters here.
app.route('/api/public/status', publicStatusRoutes);
app.route('/api/public/status', statusDeepPub);
app.route('/api/public/regulator', regulatorL5Pub);
app.route('/api/public/audit',     auditL5Pub);
app.route('/api/public/legal',     publicLegalRoutes);
app.route('/api', platformFeaturesRoutes);
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
        detail: (err as Error).message,
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
    : { error: 'Internal Server Error', message: err.message, req_id: reqId };

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
      break;

    case '45 0 * * *':
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
