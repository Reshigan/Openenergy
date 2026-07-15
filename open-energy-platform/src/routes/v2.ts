// ═══════════════════════════════════════════════════════════════════════════
// /api/v2 — HTTP layer over the v2 domain engine.
//
// This module is a thin ADAPTER: it authenticates, maps the request user to an
// engine Actor, builds EngineDeps per request, and calls applyTransition /
// exportPack / sealPendingEvents. All state-machine authority, hashing, and
// settlement-honesty live in src/v2/domain/** — nothing here recomputes them.
//
// The domain purity ban (no Date.now / new Date / Math.random) applies only
// inside src/v2/domain/**. This is the adapter layer, so Date.now() is fine and
// is exactly where the injected Clock gets its wall time.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, type Context } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

import { applyTransition, type EngineDeps } from '../v2/domain/engine';
import type { Actor, Clock, Command, IdSource, Json, ExportQuery } from '../v2/domain/types';
import { ConstraintViolation } from '../v2/domain/types';
import { ppaContract } from '../v2/domain/chains/ppa_contract';
import { drawdown } from '../v2/domain/chains/drawdown';
import { carbonRetirement } from '../v2/domain/chains/carbon_retirement';
import { licenceApplication } from '../v2/domain/chains/licence_application';
import { wo } from '../v2/domain/chains/wo';
import { permitToWork } from '../v2/domain/chains/permit_to_work';
import { algoCert } from '../v2/domain/chains/algo_cert';
import { bestExecution } from '../v2/domain/chains/best_execution';
import { capitalAdequacyReturn } from '../v2/domain/chains/capital_adequacy';
import { ccpAssessment } from '../v2/domain/chains/ccp_assessment';
import { counterpartyMargin } from '../v2/domain/chains/counterparty_margin';
import { creditInsurance } from '../v2/domain/chains/credit_insurance';
import { crossBorderTrade } from '../v2/domain/chains/cross_border_trade';
import { fscaCompliance } from '../v2/domain/chains/fsca_compliance';
import { fscaConductReport } from '../v2/domain/chains/fsca_conduct_report';
import { isdaAgreement } from '../v2/domain/chains/isda_agreement';
import { contractExecution } from '../v2/domain/chains/contract_execution';
import { disputeResolution } from '../v2/domain/chains/dispute_resolution';
import { dataBreachNotification } from '../v2/domain/chains/data_breach_notification';
import { closeOutNetting } from '../v2/domain/chains/close_out_netting';
import { collateralSubstitution } from '../v2/domain/chains/collateral_substitution';
import { wayleaveConsent } from '../v2/domain/chains/wayleave_consent';
import { environmentalAuthorisation } from '../v2/domain/chains/environmental_authorisation';
import { connectionBudgetQuote } from '../v2/domain/chains/connection_budget_quote';
import { forceMajeureClaim } from '../v2/domain/chains/force_majeure_claim';
import { marketAbuse } from '../v2/domain/chains/market_abuse';
import { marketConductExam } from '../v2/domain/chains/market_conduct_exam';
import { ppaAnnualRecon } from '../v2/domain/chains/ppa_annual_recon';
import { ppaChangeInLaw } from '../v2/domain/chains/ppa_change_in_law';
import { settlementFail } from '../v2/domain/chains/settlement_fail';
import { tradeAllocation } from '../v2/domain/chains/trade_allocation';
import { tradeReporting } from '../v2/domain/chains/trade_reporting';
import { availabilityGuarantee } from '../v2/domain/chains/availability_guarantee';
import { curtailmentClaim } from '../v2/domain/chains/curtailment_claim';
import { greenTariff } from '../v2/domain/chains/green_tariff';
import { ppaNomination } from '../v2/domain/chains/ppa_nomination';
import { ppaTermination } from '../v2/domain/chains/ppa_termination';
import { takeOrPay } from '../v2/domain/chains/take_or_pay';
import { tariffDetermination } from '../v2/domain/chains/tariff_determination';
import { virtualPpaSettlement } from '../v2/domain/chains/virtual_ppa_settlement';
import { blackStart } from '../v2/domain/chains/black_start';
import { cbtSed } from '../v2/domain/chains/cbt_sed';
import { cod } from '../v2/domain/chains/cod';
import { connectionEnergization } from '../v2/domain/chains/connection_energization';
import { constructionCostReport } from '../v2/domain/chains/construction_cost_report';
import { covenantCertificate } from '../v2/domain/chains/covenant_certificate';
import { cpClearance } from '../v2/domain/chains/cp_clearance';
import { creditOrigination } from '../v2/domain/chains/credit_origination';
import { demandResponse } from '../v2/domain/chains/demand_response';
import { disbursement } from '../v2/domain/chains/disbursement';
import { disposition } from '../v2/domain/chains/disposition';
import { edCommitment } from '../v2/domain/chains/ed_commitment';
import { eopActivation } from '../v2/domain/chains/eop_activation';
import { esapCompliance } from '../v2/domain/chains/esap_compliance';
import { esapMonitoring } from '../v2/domain/chains/esap_monitoring';
import { exportCurtailment } from '../v2/domain/chains/export_curtailment';
import { facilityAmendment } from '../v2/domain/chains/facility_amendment';
import { gca } from '../v2/domain/chains/gca';
import { greenBond } from '../v2/domain/chains/green_bond';
import { gridCapacityAllocation } from '../v2/domain/chains/grid_capacity_allocation';
import { gridCodeCompliance } from '../v2/domain/chains/grid_code_compliance';
import { gtia } from '../v2/domain/chains/gtia';
import { handoverDossier } from '../v2/domain/chains/handover_dossier';
import { hseIncident } from '../v2/domain/chains/hse_incident';
import { interconnectorSchedule } from '../v2/domain/chains/interconnector_schedule';
import { ippDocumentControl } from '../v2/domain/chains/ipp_document_control';
import { ippEvm } from '../v2/domain/chains/ipp_evm';
import { ippSchedule } from '../v2/domain/chains/ipp_schedule';
import { itp } from '../v2/domain/chains/itp';
import { loadCurtailment } from '../v2/domain/chains/load_curtailment';
import { loanDefault } from '../v2/domain/chains/loan_default';
import { loanRestructure } from '../v2/domain/chains/loan_restructure';
import { loanTransfer } from '../v2/domain/chains/loan_transfer';
import { milestoneVariance } from '../v2/domain/chains/milestone_variance';
import { oemFco } from '../v2/domain/chains/oem_fco';
import { paymentSecurity } from '../v2/domain/chains/payment_security';
import { plannedOutage } from '../v2/domain/chains/planned_outage';
import { pmCompliance } from '../v2/domain/chains/pm_compliance';
import { poaCpaInclusion } from '../v2/domain/chains/poa_cpa_inclusion';
import { procurement } from '../v2/domain/chains/procurement';
import { projectChangeOrder } from '../v2/domain/chains/project_change_order';
import { projectRisk } from '../v2/domain/chains/project_risk';
import { punchList } from '../v2/domain/chains/punch_list';
import { reserveAccount } from '../v2/domain/chains/reserve_account';
import { reserveActivation } from '../v2/domain/chains/reserve_activation';
import { securityPerfection } from '../v2/domain/chains/security_perfection';
import { slbKpi } from '../v2/domain/chains/slb_kpi';
import { sllKpi } from '../v2/domain/chains/sll_kpi';
import { submittalRfi } from '../v2/domain/chains/submittal_rfi';
import { transmissionOutage } from '../v2/domain/chains/transmission_outage';
import { wheelingAccess } from '../v2/domain/chains/wheeling_access';
import { audit } from '../v2/domain/chains/audit';
import { benchmarkTransition } from '../v2/domain/chains/benchmark_transition';
import { carbonBudget } from '../v2/domain/chains/carbon_budget';
import { carbonCreditRating } from '../v2/domain/chains/carbon_credit_rating';
import { carbonErpa } from '../v2/domain/chains/carbon_erpa';
import { carbonIssuance } from '../v2/domain/chains/carbon_issuance';
import { carbonMrv } from '../v2/domain/chains/carbon_mrv';
import { carbonOffsetClaim } from '../v2/domain/chains/carbon_offset_claim';
import { carbonRegistration } from '../v2/domain/chains/carbon_registration';
import { carbonRegistryTransfer } from '../v2/domain/chains/carbon_registry_transfer';
import { carbonReversal } from '../v2/domain/chains/carbon_reversal';
import { carbonTax } from '../v2/domain/chains/carbon_tax';
import { certificateBundle } from '../v2/domain/chains/certificate_bundle';
import { changeEnablement } from '../v2/domain/chains/change_enablement';
import { complaintResolution } from '../v2/domain/chains/complaint_resolution';
import { complianceInspection } from '../v2/domain/chains/compliance_inspection';
import { consultationNotice } from '../v2/domain/chains/consultation_notice';
import { creditingRenewal } from '../v2/domain/chains/crediting_renewal';
import { cyberIncident } from '../v2/domain/chains/cyber_incident';
import { dataSubjectRequest } from '../v2/domain/chains/data_subject_request';
import { enforcementAction } from '../v2/domain/chains/enforcement_action';
import { enforcementActionS35 } from '../v2/domain/chains/enforcement_action_s35';
import { esgDisclosure } from '../v2/domain/chains/esg_disclosure';
import { imbalance } from '../v2/domain/chains/imbalance';
import { insuranceClaim } from '../v2/domain/chains/insurance_claim';
import { kyc } from '../v2/domain/chains/kyc';
import { levyAssessment } from '../v2/domain/chains/levy_assessment';
import { licenceRenewal } from '../v2/domain/chains/licence_renewal';
import { methodologyAmendment } from '../v2/domain/chains/methodology_amendment';
import { problemManagement } from '../v2/domain/chains/problem_management';
import { protectionRelay } from '../v2/domain/chains/protection_relay';
import { publicConsultation } from '../v2/domain/chains/public_consultation';
import { recDeviceRegistration } from '../v2/domain/chains/rec_device_registration';
import { recIssuance } from '../v2/domain/chains/rec_issuance';
import { recLifecycle } from '../v2/domain/chains/rec_lifecycle';
import { scope3Disclosure } from '../v2/domain/chains/scope3_disclosure';
import { securityMargin } from '../v2/domain/chains/security_margin';
import { securityRemediation } from '../v2/domain/chains/security_remediation';
import { serviceContract } from '../v2/domain/chains/service_contract';
import { serviceRequest } from '../v2/domain/chains/service_request';
import { soilingAudit } from '../v2/domain/chains/soiling_audit';
import { sparePartsProvisioning } from '../v2/domain/chains/spare_parts_provisioning';
import { ssegRegistration } from '../v2/domain/chains/sseg_registration';
import { subscriptionBilling } from '../v2/domain/chains/subscription_billing';
import { supportTicket } from '../v2/domain/chains/support_ticket';
import { sustainabilityTransaction } from '../v2/domain/chains/sustainability_transaction';
import { tcpi } from '../v2/domain/chains/tcpi';
import { vcmProjectDevelopment } from '../v2/domain/chains/vcm_project_development';
import { vendorEscalation } from '../v2/domain/chains/vendor_escalation';
import { warrantyClaim } from '../v2/domain/chains/warranty_claim';
import { warrantyRecovery } from '../v2/domain/chains/warranty_recovery';
import { poslimitCase } from '../v2/domain/chains/poslimit_case';
import { ppaObligation } from '../v2/domain/chains/ppa_obligation';
import { tariffIndexation } from '../v2/domain/chains/tariff_indexation';
import { oeDispatchNominations } from '../v2/domain/chains/oe_dispatch_nominations';
import { substationAsset } from '../v2/domain/chains/substation_asset';
import { dscrMonitoring } from '../v2/domain/chains/dscr_monitoring';
import { regulatorInbox } from '../v2/domain/chains/regulator_inbox';
import { complianceNotice } from '../v2/domain/chains/compliance_notice';
import { commissioning } from '../v2/domain/chains/commissioning';
import { assetPrognostics } from '../v2/domain/chains/asset_prognostics';
import { prUnderperformance } from '../v2/domain/chains/pr_underperformance';
import { ncr } from '../v2/domain/chains/ncr';
import { bessSoh } from '../v2/domain/chains/bess_soh';
import { generationRevenueAssurance } from '../v2/domain/chains/generation_revenue_assurance';
import { siteInstruction } from '../v2/domain/chains/site_instruction';
import { dfr } from '../v2/domain/chains/dfr';
import { dscrReport } from '../v2/domain/chains/dscr_report';
import { slaPerformanceReport } from '../v2/domain/chains/sla_performance_report';
import { csatRecord } from '../v2/domain/chains/csat_record';
import { stageGate } from '../v2/domain/chains/stage_gate';
import { article6Adjustment } from '../v2/domain/chains/article6_adjustment';
import { auditChainBlock } from '../v2/domain/chains/audit_chain_block';
import { variationOrder } from '../v2/domain/chains/variation_order';
import { regulatorExportPack } from '../v2/domain/chains/regulator_export_pack';
import { licenceObligation } from '../v2/domain/chains/licence_obligation';
import { cpTracker } from '../v2/domain/chains/cp_tracker';
import { dlpDefect } from '../v2/domain/chains/dlp_defect';
import { pnlAttribution } from '../v2/domain/chains/pnl_attribution';
import { pretradeCreditCheck } from '../v2/domain/chains/pretrade_credit_check';
import { smartMeterAsset } from '../v2/domain/chains/smart_meter_asset';
import { unservedEnergyClaim } from '../v2/domain/chains/unserved_energy_claim';
import { greenTariffDisclosure } from '../v2/domain/chains/green_tariff_disclosure';
import { GUARDS } from '../v2/domain/guards/registry';
import { exportPack } from '../v2/domain/export';
import { IMPORTABLE_CHAINS, RENAMED_IMPORTS, fetchLegacyRows, importChain } from '../v2/import/legacy';
import { sealPendingEvents } from '../v2/domain/merkle-seal';
// D1Store is authored in a parallel workstream (src/v2/store/d1.ts). Until it
// lands, tsc reports "cannot find module '../v2/store/d1'" — that error is
// EXPECTED-pending-integration, not a defect in this file.
import { D1Store } from '../v2/store/d1';

const v2 = new Hono<HonoEnv>();
v2.use('*', authMiddleware);

// Operator-class roles: platform staff / regulator who see across parties.
// ponytail: hard-coded set; move to an rbac table if the role list churns.
const OPERATOR_ROLES = ['admin', 'operator', 'regulator', 'support'];

// The chain registry lives inline in deps, chains-as-data. More chains get
// added to this Record as they are transcribed; there is no separate registry
// file by design. Exported for the cron sweeps below and the bundle tests.
export const CHAINS = {
  ppa_contract: ppaContract,
  drawdown,
  carbon_retirement: carbonRetirement,
  licence_application: licenceApplication,
  wo,
  permit_to_work: permitToWork,
  algo_cert: algoCert,
  best_execution: bestExecution,
  capital_adequacy: capitalAdequacyReturn,
  ccp_assessment: ccpAssessment,
  counterparty_margin: counterpartyMargin,
  credit_insurance: creditInsurance,
  cross_border_trade: crossBorderTrade,
  fsca_compliance: fscaCompliance,
  fsca_conduct_report: fscaConductReport,
  isda_agreement: isdaAgreement,
  contract_execution: contractExecution,
  dispute_resolution: disputeResolution,
  data_breach_notification: dataBreachNotification,
  close_out_netting: closeOutNetting,
  collateral_substitution: collateralSubstitution,
  wayleave_consent: wayleaveConsent,
  environmental_authorisation: environmentalAuthorisation,
  connection_budget_quote: connectionBudgetQuote,
  force_majeure_claim: forceMajeureClaim,
  market_abuse: marketAbuse,
  market_conduct_exam: marketConductExam,
  ppa_annual_recon: ppaAnnualRecon,
  ppa_change_in_law: ppaChangeInLaw,
  settlement_fail: settlementFail,
  trade_allocation: tradeAllocation,
  trade_reporting: tradeReporting,
  availability_guarantee: availabilityGuarantee,
  curtailment_claim: curtailmentClaim,
  green_tariff: greenTariff,
  ppa_nomination: ppaNomination,
  ppa_termination: ppaTermination,
  take_or_pay: takeOrPay,
  tariff_determination: tariffDetermination,
  virtual_ppa_settlement: virtualPpaSettlement,
  black_start: blackStart,
  cbt_sed: cbtSed,
  cod: cod,
  connection_energization: connectionEnergization,
  construction_cost_report: constructionCostReport,
  covenant_certificate: covenantCertificate,
  cp_clearance: cpClearance,
  credit_origination: creditOrigination,
  demand_response: demandResponse,
  disbursement: disbursement,
  disposition: disposition,
  ed_commitment: edCommitment,
  eop_activation: eopActivation,
  esap_compliance: esapCompliance,
  esap_monitoring: esapMonitoring,
  export_curtailment: exportCurtailment,
  facility_amendment: facilityAmendment,
  gca: gca,
  green_bond: greenBond,
  grid_capacity_allocation: gridCapacityAllocation,
  grid_code_compliance: gridCodeCompliance,
  gtia: gtia,
  handover_dossier: handoverDossier,
  hse_incident: hseIncident,
  interconnector_schedule: interconnectorSchedule,
  ipp_document_control: ippDocumentControl,
  ipp_evm: ippEvm,
  ipp_schedule: ippSchedule,
  itp: itp,
  load_curtailment: loadCurtailment,
  loan_default: loanDefault,
  loan_restructure: loanRestructure,
  loan_transfer: loanTransfer,
  milestone_variance: milestoneVariance,
  oem_fco: oemFco,
  payment_security: paymentSecurity,
  planned_outage: plannedOutage,
  pm_compliance: pmCompliance,
  poa_cpa_inclusion: poaCpaInclusion,
  procurement: procurement,
  project_change_order: projectChangeOrder,
  project_risk: projectRisk,
  punch_list: punchList,
  reserve_account: reserveAccount,
  reserve_activation: reserveActivation,
  security_perfection: securityPerfection,
  slb_kpi: slbKpi,
  sll_kpi: sllKpi,
  submittal_rfi: submittalRfi,
  transmission_outage: transmissionOutage,
  wheeling_access: wheelingAccess,
  audit: audit,
  benchmark_transition: benchmarkTransition,
  carbon_budget: carbonBudget,
  carbon_credit_rating: carbonCreditRating,
  carbon_erpa: carbonErpa,
  carbon_issuance: carbonIssuance,
  carbon_mrv: carbonMrv,
  carbon_offset_claim: carbonOffsetClaim,
  carbon_registration: carbonRegistration,
  carbon_registry_transfer: carbonRegistryTransfer,
  carbon_reversal: carbonReversal,
  carbon_tax: carbonTax,
  certificate_bundle: certificateBundle,
  change_enablement: changeEnablement,
  complaint_resolution: complaintResolution,
  compliance_inspection: complianceInspection,
  consultation_notice: consultationNotice,
  crediting_renewal: creditingRenewal,
  cyber_incident: cyberIncident,
  data_subject_request: dataSubjectRequest,
  enforcement_action: enforcementAction,
  enforcement_action_s35: enforcementActionS35,
  esg_disclosure: esgDisclosure,
  imbalance: imbalance,
  insurance_claim: insuranceClaim,
  kyc: kyc,
  levy_assessment: levyAssessment,
  licence_renewal: licenceRenewal,
  methodology_amendment: methodologyAmendment,
  problem_management: problemManagement,
  protection_relay: protectionRelay,
  public_consultation: publicConsultation,
  rec_device_registration: recDeviceRegistration,
  rec_issuance: recIssuance,
  rec_lifecycle: recLifecycle,
  scope3_disclosure: scope3Disclosure,
  security_margin: securityMargin,
  security_remediation: securityRemediation,
  service_contract: serviceContract,
  service_request: serviceRequest,
  soiling_audit: soilingAudit,
  spare_parts_provisioning: sparePartsProvisioning,
  sseg_registration: ssegRegistration,
  subscription_billing: subscriptionBilling,
  support_ticket: supportTicket,
  sustainability_transaction: sustainabilityTransaction,
  tcpi: tcpi,
  vcm_project_development: vcmProjectDevelopment,
  vendor_escalation: vendorEscalation,
  warranty_claim: warrantyClaim,
  warranty_recovery: warrantyRecovery,
  poslimit_case: poslimitCase,
  ppa_obligation: ppaObligation,
  tariff_indexation: tariffIndexation,
  oe_dispatch_nominations: oeDispatchNominations,
  substation_asset: substationAsset,
  dscr_monitoring: dscrMonitoring,
  regulator_inbox: regulatorInbox,
  compliance_notice: complianceNotice,
  commissioning: commissioning,
  asset_prognostics: assetPrognostics,
  pr_underperformance: prUnderperformance,
  ncr: ncr,
  bess_soh: bessSoh,
  generation_revenue_assurance: generationRevenueAssurance,
  site_instruction: siteInstruction,
  dfr: dfr,
  dscr_report: dscrReport,
  sla_performance_report: slaPerformanceReport,
  csat_record: csatRecord,
  stage_gate: stageGate,
  article6_adjustment: article6Adjustment,
  audit_chain_block: auditChainBlock,
  variation_order: variationOrder,
  regulator_export_pack: regulatorExportPack,
  licence_obligation: licenceObligation,
  cp_tracker: cpTracker,
  dlp_defect: dlpDefect,
  pnl_attribution: pnlAttribution,
  pretrade_credit_check: pretradeCreditCheck,
  smart_meter_asset: smartMeterAsset,
  unserved_energy_claim: unservedEnergyClaim,
  green_tariff_disclosure: greenTariffDisclosure,
};

const clock: Clock = { now: () => ({ epoch_ms: Date.now(), zone: 'UTC' }) };
const ids: IdSource = { uuid: () => crypto.randomUUID() };

/** Build EngineDeps for one request. Store is per-request (bound to c.env.DB). */
function buildDeps(c: Context<HonoEnv>): EngineDeps {
  return { store: new D1Store(c.env.DB), clock, ids, chains: CHAINS, guards: GUARDS };
}

/** Map the authenticated user to the engine Actor.
 *  The JWT `sub` IS the participant_id (see JWTPayload in utils/types.ts), so
 *  user.id doubles as the participant. Delegation (on_behalf_of) is not modelled
 *  in the auth context, so it is always null here. */
function actorOf(user: ReturnType<typeof getCurrentUser>): Actor {
  return { id: user.id, kind: 'user', participant_id: user.id, on_behalf_of: null };
}

/** Result.code → HTTP status. Guard/domain rejections (SELF_DEALING, etc.)
 *  fall through to 422 carrying their own code in the body. */
function httpStatus(code: string): 400 | 403 | 404 | 409 | 422 | 500 {
  switch (code) {
    case 'BAD_INPUT':
    case 'UNKNOWN_EDGE':
      return 400;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'STALE':
    case 'CONFLICT':
    case 'CONTENTION':
    case 'ILLEGAL_TRANSITION':
      return 409;
    case 'INTERNAL':
      return 500;
    default:
      return 422;
  }
}

/** Run applyTransition and translate the outcome to an HTTP response.
 *  - ok            → 200
 *  - {ok:false}    → httpStatus(code) (400 bad input, 409 concurrency, 422 guard, …)
 *  - ConstraintViolation thrown → 409 (txn_seq / idempotency_key races the engine
 *    did not absorb)
 *  - any other throw → 500, log-shape only (never leak internals to the client). */
async function runCommand(c: Context<HonoEnv>, cmd: Command, extra?: Record<string, Json>) {
  try {
    const result = await applyTransition(cmd, buildDeps(c));
    const status = result.ok ? 200 : httpStatus(result.code);
    return c.json({ ...extra, ...result }, status);
  } catch (e) {
    if (e instanceof ConstraintViolation) {
      return c.json({ ...extra, ok: false, code: 'CONFLICT', constraint: e.constraint }, 409);
    }
    console.error('v2.applyTransition unexpected error', { edge: cmd.edge, chain: cmd.chain_key, name: (e as Error)?.name });
    return c.json({ ok: false, code: 'INTERNAL', message: 'internal error' }, 500);
  }
}

// ── POST /txn — initiate a chain (the @new edge) ────────────────────────────
// Body: { chain_key, edge, input, idempotency_key, reason_code?, reason_text? }
// The txn id is generated server-side and returned so the client can address
// the new txn. expected_seq is fixed to { [new_id]: -1 } (the initiating token).
v2.post('/txn', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.chain_key !== 'string' || typeof body.edge !== 'string' || typeof body.idempotency_key !== 'string') {
    return c.json({ ok: false, code: 'BAD_INPUT', message: 'chain_key, edge, idempotency_key are required' }, 400);
  }

  const txn_id = ids.uuid();
  const cmd: Command = {
    txn_id,
    chain_key: body.chain_key,
    edge: body.edge,
    actor: actorOf(user),
    input: (body.input ?? {}) as Record<string, Json>,
    expected_seq: { [txn_id]: -1 },
    idempotency_key: body.idempotency_key,
    reason_code: body.reason_code,
    reason_text: body.reason_text,
  };
  return runCommand(c, cmd, { txn_id });
});

// ── POST /txn/:id/act — advance an existing txn ─────────────────────────────
// Body: { chain_key, edge, input, expected_seq?, idempotency_key, reason_code?, reason_text? }
// expected_seq may be a number (the txn's seq token) or a full {[id]:seq} map.
// When omitted, the current seq is read from the store as the optimistic token.
v2.post('/txn/:id/act', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.chain_key !== 'string' || typeof body.edge !== 'string' || typeof body.idempotency_key !== 'string') {
    return c.json({ ok: false, code: 'BAD_INPUT', message: 'chain_key, edge, idempotency_key are required' }, 400);
  }

  // Resolve the optimistic-concurrency token.
  let expected_seq: Record<string, number>;
  if (typeof body.expected_seq === 'number') {
    expected_seq = { [id]: body.expected_seq };
  } else if (body.expected_seq && typeof body.expected_seq === 'object') {
    expected_seq = body.expected_seq as Record<string, number>;
  } else {
    const bundle = await buildDeps(c).store.getTxn(id);
    if (!bundle) return c.json({ ok: false, code: 'NOT_FOUND', message: `txn ${id} not found` }, 404);
    expected_seq = { [id]: bundle.txn.seq };
  }

  const cmd: Command = {
    txn_id: id,
    chain_key: body.chain_key,
    edge: body.edge,
    actor: actorOf(user),
    input: (body.input ?? {}) as Record<string, Json>,
    expected_seq,
    idempotency_key: body.idempotency_key,
    reason_code: body.reason_code,
    reason_text: body.reason_text,
  };
  return runCommand(c, cmd);
});

// ── GET /txn/:id — read a txn + its parties + event log ─────────────────────
// Visibility: operator-class roles see any txn; otherwise the caller must be a
// live party, or the chain must be publicly visible.
// ponytail: 'owner' visibility should narrow to the owner-role party only; here
// it is gated to party-or-operator. Tighten when a chain declares owner
// visibility and the owner role is distinguished from other parties.
v2.get('/txn/:id', async (c) => {
  const user = getCurrentUser(c);
  const bundle = await buildDeps(c).store.getTxn(c.req.param('id'));
  if (!bundle) return c.json({ success: false, error: 'not found' }, 404);

  const isOperator = OPERATOR_ROLES.includes(user.role);
  const isParty = bundle.parties.some((p) => p.until_event_id === null && p.participant_id === user.id);
  const isPublic = bundle.txn.visibility === 'public';
  if (!isOperator && !isParty && !isPublic) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  return c.json({ success: true, data: bundle });
});

// ── GET /chains — serialize the chain registry for the generative frontend ──
// JSON.stringify drops function-valued props (title/derive), keeping the pure
// data the UI needs: fields, states, transitions (with input FieldDecls +
// guards + requiresReason), roles, timers, settles, visibility. This is the
// single source the four surfaces read to generate every screen and form.
v2.get('/chains', (c) => {
  return c.json({ success: true, data: JSON.parse(JSON.stringify(CHAINS)) });
});

// ── GET /legacy-coverage — v1 chain_key → v2 chain_key, for legacy-route ─────
// redirects. Same allow-list that gates POST /import/:chain_key: every key
// here has a live v2 counterpart (RENAMED_IMPORTS remaps the key; identity
// otherwise). Keys absent from this map are the P2 backlog — their /ledger
// and /thread routes stay on legacy data. See CUTOVER_COVERAGE.md §6.
v2.get('/legacy-coverage', (c) => {
  const data = Object.fromEntries(Object.keys(IMPORTABLE_CHAINS).map((k) => [k, RENAMED_IMPORTS[k] ?? k]));
  return c.json({ success: true, data });
});

// ── GET /txns — flexible list feeding Home / Find / Ledger ──────────────────
// Query: ?chain_key=&open=1&mine=1&q=&limit=
// Visibility: non-operators are ALWAYS scoped to their own party (+public) —
// they can never enumerate another party's txns. Operators see all, unless
// mine=1 narrows them to their own. The client computes the rich Home ordering
// (blocking / SLA / money) from the chain decl; the server returns opened_at DESC.
v2.get('/txns', async (c) => {
  const user = getCurrentUser(c);
  const isOperator = OPERATOR_ROLES.includes(user.role);
  const mine = c.req.query('mine') === '1';
  const limit = Number(c.req.query('limit')) || 100;
  const rows = await buildDeps(c).store.listTxns({
    scope_participant_id: isOperator && !mine ? undefined : user.id,
    chain_key: c.req.query('chain_key') || undefined,
    open_only: c.req.query('open') === '1',
    q: c.req.query('q') || undefined,
    limit,
  });
  return c.json({ success: true, data: rows });
});

// ── GET /export — L6 regulator export pack (pure read over the event log) ────
// Query: ?chain_keys=a,b&from=<iso>&to=<iso>&participant_ids=x,y
// Non-operator callers are scoped to their own participant id, so the export
// can never leak another party's log. The custody notice for settles:false
// chains is stamped inside exportPack and passed straight through — never
// stripped or altered here.
v2.get('/export', async (c) => {
  const user = getCurrentUser(c);
  const csv = (s: string | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

  const chain_keys = csv(c.req.query('chain_keys'));
  if (chain_keys.length === 0) {
    return c.json({ success: false, error: 'chain_keys is required' }, 400);
  }
  const unknown = chain_keys.filter((k) => !(k in CHAINS));
  if (unknown.length) {
    return c.json({ success: false, error: `unknown chain_keys: ${unknown.join(',')}` }, 400);
  }

  const isOperator = OPERATOR_ROLES.includes(user.role);
  // Honest visibility gate: non-operators may only export their own party's log.
  // ponytail: no party-scoped multi-participant export yet; add when a caller
  // legitimately needs several participants they are a party to.
  const participant_ids = isOperator ? csv(c.req.query('participant_ids')) : [user.id];

  const query: ExportQuery = {
    chain_keys,
    from: c.req.query('from') || undefined,
    to: c.req.query('to') || undefined,
    participant_ids: participant_ids.length ? participant_ids : undefined,
  };

  const pack = await exportPack(query, {
    store: buildDeps(c).store,
    chains: CHAINS,
    generated_at: new Date().toISOString(),
    generated_by: user.id,
  });
  return c.json(pack);
  // ponytail: no export pagination — a single query returns the full window.
  // Add cursor/limit when a real regulator pull exceeds the response budget.
});

// ── POST /seal — manual/dev trigger of the nightly merkle seal ──────────────
// Gated to admin/operator. The nightly cron calls sealPendingEvents directly;
// this is the manual seam. Returns the new root row, or { sealed: null } when
// there is nothing pending.
v2.post('/seal', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'operator'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const row = await sealPendingEvents(buildDeps(c).store, clock);
  return c.json({ sealed: row });
});

// ── POST /import/:chain_key — REBUILD_PLAN §11 legacy backfill ───────────────
// Gated to admin/operator like /seal. Body: { limit?, dry_run? }. Pulls not-
// yet-imported v1 rows (resumable NOT EXISTS query over idempotency keys) and
// writes one seq-1 `.imported` event per row. Table/column identifiers come
// from the static MERIDIAN_CHAINS descriptor via the IMPORTABLE_CHAINS
// allow-list — the :chain_key request value never reaches identifier position.
v2.post('/import/:chain_key', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'operator'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const chain_key = c.req.param('chain_key');
  if (!(chain_key in IMPORTABLE_CHAINS)) {
    return c.json({ success: false, error: `chain '${chain_key}' is not importable` }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit) || 200, 500));
  const rows = await fetchLegacyRows(c.env.DB, chain_key, limit);
  const report = await importChain(rows, chain_key, buildDeps(c), { dry_run: body?.dry_run === true });
  return c.json({ success: true, data: report });
});

// ── Cron seams — called by runCron() in src/index.ts, not by HTTP ────────────
// v2TimerSweep drains due v2_timers rows (SLA auto-fires + time-bars). Design
// (plan §timers): no claimed_at column — delete-after-attempt is safe because
// the idempotency key `timer:${key}:${due_at}` is deterministic and the engine
// replays duplicates instead of double-writing. One dueTimers call per class so
// a noisy SLA backlog can't starve time-bars. A transient throw leaves the row
// in place for the next 15-min sweep; a definitive engine rejection deletes it
// (state moved on, guard says no — refiring forever would just spam the log).
export async function sweepTimers(
  deps: EngineDeps,
  nowIso: string,
): Promise<{ fired: number; rejected: number; stale: number; errors: number }> {
  const { store } = deps;
  const out = { fired: 0, rejected: 0, stale: 0, errors: 0 };
  for (const cls of ['sla', 'time_bar'] as const) {
    for (const t of await store.dueTimers(nowIso, 200, cls)) {
      try {
        const bundle = await store.getTxn(t.txn_id);
        if (!bundle || bundle.txn.closed_at !== null) {
          await store.deleteTimer(t.id); // orphan or already-terminal txn
          out.stale++;
          continue;
        }
        const chain = deps.chains[bundle.txn.chain_key];
        // recover the declaring TimerDecl (for its reason_code) by re-deriving
        // the row key the engine armed: `${txn_id}:${onState}:${fire}`
        const decl = (chain?.timers ?? []).find(
          (d) => t.key === `${t.txn_id}:${d.onState}:${d.fire}`,
        );
        const cmd: Command = {
          txn_id: t.txn_id,
          chain_key: bundle.txn.chain_key,
          edge: t.fire,
          actor: { id: 'system:timer', kind: 'system:timer', participant_id: null, on_behalf_of: null },
          input: {},
          expected_seq: { [t.txn_id]: bundle.txn.seq },
          idempotency_key: `timer:${t.key}:${t.due_at}`,
          ...(decl?.reason ? { reason_code: decl.reason } : {}),
        };
        const r = await applyTransition(cmd, deps);
        if (r.ok) out.fired++;
        else out.rejected++;
        // success already cleared the txn's timers (re-arm semantics); this
        // covers the rejected path so a dead timer can't refire every 15 min
        await store.deleteTimer(t.id);
      } catch {
        out.errors++; // leave the row — next sweep retries
      }
    }
  }
  return out;
}

export async function v2TimerSweep(
  env: HonoEnv['Bindings'],
): Promise<{ fired: number; rejected: number; stale: number; errors: number }> {
  const store = new D1Store(env.DB);
  const deps: EngineDeps = { store, clock, ids, chains: CHAINS, guards: GUARDS };
  return sweepTimers(deps, new Date(clock.now().epoch_ms).toISOString());
}

// Nightly merkle seal — same call the manual POST /seal makes.
export async function v2NightlySeal(env: HonoEnv['Bindings']): Promise<void> {
  await sealPendingEvents(new D1Store(env.DB), clock);
}

export default v2;
