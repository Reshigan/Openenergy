// ═══════════════════════════════════════════════════════════════════════════
// Legacy backfill importer — REBUILD_PLAN §11 / CUTOVER_COVERAGE §4.
//
// One `<chain>.imported` event per v1 row: seq 1, from_state null, full v1 row
// preserved in payload under { provenance: 'legacy' }, hash-chained from the
// same genesis prev_hash real initiations use — so verifyPack passes an
// imported log unmodified. Writes go through Store.commit() directly, NOT
// applyTransition: an import is a statement of fact about the legacy world,
// not a transition anyone authorised (actor_kind 'system:import').
//
// SECURITY invariant (same as chain-registry-meridian.ts): every value
// interpolated into a SQL identifier position comes from the static
// MERIDIAN_CHAINS registry. Request values only ever bind to `?` placeholders.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ChainDecl,
  Clock,
  CommitBatch,
  EventRow,
  IdSource,
  Json,
  PartyRow,
  Store,
  TimerRow,
  TxnRow,
} from '../domain/types';
import { ConstraintViolation } from '../domain/types';
import { eventHash, genesisPrevHash } from '../domain/hash';
import { addDuration, isoUtc } from '../domain/time';
import { MERIDIAN_CHAINS, type ChainDescriptor } from '../../utils/chain-registry-meridian';

/** The EXACT chains cleared for import (CUTOVER_COVERAGE §1 + §4.1): the 20
 *  terminal-clean chains plus 69 EXACT-with-mismatch chains whose status
 *  mappings are written below. `ccp_assessment` and `disposition` are held
 *  out pending a domain decision (v1/v2 semantics diverge — see §4.1 notes).
 *  Doubles as the party map: the descriptor's counterpartyCol maps to this
 *  role_on_txn — null where the column names a site/asset/free-text/ref value
 *  we cannot confidently map to a participant. Static by design (allow-list). */
export const IMPORTABLE_CHAINS: Record<string, string | null> = {
  availability_guarantee: 'contractor',
  benchmark_transition: 'counterparty',
  best_execution: 'client',
  black_start: 'provider',
  carbon_budget: null,
  carbon_credit_rating: 'issuer',
  carbon_erpa: 'buyer',
  carbon_issuance: 'proponent',
  carbon_offset_claim: 'sars',
  carbon_registration: 'developer',
  carbon_registry_transfer: 'transferee',
  carbon_retirement: null, // beneficiary_name — free text, doubles as titleCol
  carbon_reversal: 'proponent',
  certificate_bundle: null,
  complaint_resolution: 'complainant',
  compliance_inspection: 'licensee',
  connection_energization: 'operator',
  construction_cost_report: 'contractor',
  counterparty_margin: 'counterparty',
  covenant_certificate: 'borrower',
  cp_clearance: 'borrower',
  credit_insurance: 'insurer',
  cross_border_trade: null, // counterparty_jurisdiction — not a participant
  curtailment_claim: 'generator',
  cyber_incident: null,
  drawdown: 'lender',
  ed_commitment: 'authority',
  enforcement_action: 'respondent',
  enforcement_action_s35: 'respondent',
  eop_activation: null,
  esap_compliance: null,
  esap_monitoring: null, // site_name — not a participant
  esg_disclosure: 'reporting_entity',
  export_curtailment: null, // ppa_ref — contract ref, not a participant
  facility_amendment: null, // facility_id — not a participant
  fsca_conduct_report: null,
  grid_code_compliance: 'facility_party',
  handover_dossier: null, // ball-in-court is a role token, not a participant id
  hse_incident: null,
  insurance_claim: 'insurer',
  interconnector_schedule: 'neighbour_utility',
  ipp_evm: null, // ball-in-court is a role token, not a participant id
  ipp_schedule: null,
  isda_agreement: 'party_b',
  itp: 'contractor',
  levy_assessment: null, // regulator-originated, no counterparty column
  licence_application: 'applicant',
  licence_renewal: 'holder',
  load_curtailment: 'consumer',
  loan_default: 'borrower',
  loan_restructure: 'borrower',
  loan_transfer: 'borrower',
  market_conduct_exam: 'entity',
  methodology_amendment: null,
  oem_fco: 'oem',
  permit_to_work: 'holder',
  planned_outage: 'requester',
  pm_compliance: 'assignee',
  poa_cpa_inclusion: 'coordinator',
  ppa_annual_recon: 'seller',
  ppa_change_in_law: 'claimant',
  ppa_nomination: 'seller',
  ppa_termination: 'seller',
  project_change_order: 'contractor',
  project_risk: 'risk_owner',
  public_consultation: null,
  punch_list: 'contractor',
  rec_lifecycle: 'issuer',
  reserve_account: 'borrower',
  reserve_activation: 'provider',
  security_perfection: 'grantor',
  security_remediation: null,
  service_contract: 'customer',
  service_request: 'requester',
  settlement_fail: 'counterparty',
  sll_kpi: 'borrower',
  soiling_audit: 'owner',
  spare_parts_provisioning: 'supplier',
  sseg_registration: 'applicant',
  submittal_rfi: 'contractor',
  tariff_determination: 'applicant',
  trade_allocation: 'counterparty',
  transmission_outage: null, // asset_label — not a participant
  vcm_project_development: 'validator',
  vendor_escalation: 'vendor',
  virtual_ppa_settlement: 'generator', // migration 488: participant, not asset
  warranty_claim: 'vendor',
  warranty_recovery: 'vendor',
  wheeling_access: null,
  // RENAMED sources (§2) — keys are v1 descriptor keys; see RENAMED_IMPORTS.
  algo_certification: 'applicant', // trading-member firm seeking certification; v2 declares applicant_party role 'applicant'
  capital_adequacy_report: null, // counterpartyCol is null (single-entity regulatory filing)
  carbon_scope3_disclosure: 'reporter', // names the reporting entity (a participant); v2 states are held by 'reporter'
  carbon_tax_return: null, // counterpartyCol is null (taxpayer's own SARS filing)
  cbt_sed_report: null, // free-text community name, not a platform participant
  change_request: null, // counterpartyCol is null (single-party desk record)
  cod_chain: 'contractor', // EPC contractor is a participant (matches project_change_order precedent)
  control_environment_audit: null, // counterpartyCol is null (internal control audit)
  credit_facility_application: 'applicant', // borrower applying for the facility; v2 facility_offered holder is 'applicant'
  crediting_period_renewal: 'validator', // VVB (validation & verification body) is a participant; v2 holder 'validator'
  demand_response_event: null, // counterpartyCol is null (operator_id lookup exists but no counterparty column)
  disbursement_case: 'borrower', // names the borrowing participant; v2 disbursement declares role 'borrower'
  fsca_compliance_report: null, // counterpartyCol is null on the v1 descriptor
  gca_connection: 'operator', // names the network operator participant; v2 gca declares role 'operator'
  green_bond_report: null, // counterpartyCol is null on the v1 descriptor
  imbalance_settlement: 'counterparty', // BRP participant id; v2 imbalance role 'counterparty' is labelled "Counterparty (BRP)"
  ipp_aud: null, // last-actor party token, not a stable counterparty (handover_dossier precedent)
  ipp_doc_control: null, // counterpartyCol is null on the v1 descriptor
  ipp_fm: null, // counterpartyCol is null on the v1 descriptor
  kyc_verification: 'subject', // the participant under verification; v2 kyc declares role 'subject'
  market_abuse_case: null, // free-text name column (the id lives in subject_party_id, not the counterpartyCol)
  milestone_variance_report: null, // counterpartyCol is null on the v1 descriptor
  mrv_submissions: 'doe', // DOE auditor assignee is a participant (assignee precedent: pm_compliance)
  om_work_order: null, // assigned_to is a technician id, not a contractual counterparty
  ppa_contract_chain: null, // no seller-name column; project_name is the deal identifier
  ppa_payment_security: 'seller', // seller (IPP) holding the credit support
  ppa_take_or_pay: 'ipp', // IPP seller party to the ToP true-up
  problem_record: null, // single-party desk record
  procurement_rfp: 'vendor', // awarded bidder is the vendor counterparty
  rez_capacity: 'applicant', // connection applicant party
  slb_kpi_ratchet: null, // no counterparty column
  support_tickets: 'reporter', // ticket reporter is the counterparty user
  trade_report: 'counterparty', // trade counterparty (settlement_fail/trade_allocation precedent)

  // ── wave 2 (cutover coverage sweep) ──────────────────────────────────────
  // 56 chains that had a v1 descriptor and rows but no import path. Every one
  // is `null` for the same measured reason: none of their counterpartyCol
  // values holds a participant id — they are site names, asset tags, refs or
  // free text (checked column-by-column against `participants`). importChain's
  // UUID_RE guard means naming a role here would attach zero party rows
  // anyway, so `null` states the fact instead of implying an attachment.
  // Deliberately absent, same rule as RENAMED_IMPORTS: `work_order` (second
  // descriptor over om_work_orders, drained by om_work_order) and `gcc_ncr`
  // (rides oe_grid_code_compliance, drained by grid_code_compliance) — each
  // source table imports exactly once.
  article6_adjustment: null,
  asset_prognostics: null,
  audit_chain_block: null,
  bess_soh: null,
  commissioning: null,
  compliance_notice: null,
  cp_tracker: null,
  csat_record: null,
  dlp_defect: null,
  dscr_monitoring: null,
  dscr_report: null,
  generation_revenue_assurance: null,
  green_tariff_disclosure: null,
  ipp_ael: null,
  ipp_anr: null,
  ipp_bbbee: null,
  ipp_bfs: null,
  ipp_cep: null,
  ipp_construction_diary: null,
  ipp_eam: null,
  ipp_eco: null,
  ipp_env_closure: null,
  ipp_hra: null,
  ipp_ie_cert: null,
  ipp_iear: null,
  ipp_land_register: null,
  ipp_lcr: null,
  ipp_method_statement: null,
  ipp_mir: null,
  ipp_om_handover: null,
  ipp_payment_cert: null,
  ipp_performance_bonds: null,
  ipp_progress_claim: null,
  ipp_refi: null,
  ipp_rfi: null,
  ipp_rpr: null,
  ipp_sed: null,
  ipp_subcontractor: null,
  ipp_submittal: null,
  ipp_tpa: null,
  licence_obligation: null,
  ncr: null,
  oe_dispatch_nominations: null,
  pnl_attribution: null,
  ppa_obligation: null,
  pr_underperformance: null,
  pretrade_credit_check: null,
  regulator_export_pack: null,
  regulator_inbox: null,
  site_instruction: null,
  sla_performance_report: null,
  smart_meter_asset: null,
  stage_gate: null,
  substation_asset: null,
  tariff_indexation: null,
  variation_order: null,

  // ── wave 3 (STATUS_MAP cutover coverage) ─────────────────────────────────
  // 27 chains whose v1 statuses are now mapped in STATUS_MAP below, so they
  // become importable. Same `null` rule as wave 2: each counterpartyCol is a
  // free-text name (contractor_name, acquirer_name, transferee_name,
  // broker_name, counterparty_name, lta_firm_name, proponent_party_name,
  // dfi_names), an institution string (network_operator, issuing_bank,
  // agent_bank), a role token (current_ball_in_court_party, assigned_designer,
  // report_submitted_to, source_party, trader_party), or absent — never a
  // participant id, so UUID_RE attaches zero parties and `null` states it.
  ccp_assessment: null, // proponent_party_name (free-text name)
  disposition: null, // source_party (role token, not a participant id)
  poslimit_case: null, // trader_party (role token, not a participant id)
  dfr: null, // current_ball_in_court_party (role token, handover_dossier precedent)
  unserved_energy_claim: null, // no counterparty column
  ipp_acs: null, // no counterparty column
  ipp_ccc: null, // network_operator (institution string)
  ipp_cd: null, // contractor_name (free-text name)
  ipp_coc: null, // acquirer_name (free-text name)
  ipp_ctr: null, // no counterparty column
  ipp_empr: null, // no counterparty column
  ipp_env_monitoring: null, // report_submitted_to (role token)
  ipp_eqt: null, // transferee_name (free-text name)
  ipp_esmr: null, // dfi_names (plural free-text names)
  ipp_final_completion: null, // no counterparty column
  ipp_gcc: null, // no counterparty column
  ipp_insr: null, // broker_name (free-text name)
  ipp_lam: null, // counterparty_name (free-text name)
  ipp_lrep: null, // agent_bank (institution string)
  ipp_lta: null, // lta_firm_name (free-text name)
  ipp_mc: null, // no counterparty column
  ipp_omc: null, // contractor_name (free-text name)
  ipp_ppavar: null, // no counterparty column
  ipp_psec: null, // issuing_bank (institution string)
  ipp_qgr: null, // no counterparty column
  ipp_tq: null, // assigned_designer (role token)
  ipp_wul: null, // no counterparty column
};

/** RENAMED sources (CUTOVER_COVERAGE §2): v1 descriptor key → v2 chain key.
 *  Import is invoked with the v1 key (it names the source table via the
 *  MERIDIAN_CHAINS descriptor); events and txns land under the v2 chain, so
 *  genesis prev_hash, event type and txn chain_key all use the v2 key while
 *  idempotency stays keyed by the v1 source (resumable per source table).
 *  `work_order` (duplicate descriptor over om_work_orders) and `gcc_ncr`
 *  (rides oe_grid_code_compliance, already drained via the EXACT import) are
 *  deliberately absent — each table imports exactly once. Static allow-list. */
export const RENAMED_IMPORTS: Record<string, string> = {
  algo_certification: 'algo_cert',
  capital_adequacy_report: 'capital_adequacy',
  carbon_scope3_disclosure: 'scope3_disclosure',
  carbon_tax_return: 'carbon_tax',
  cbt_sed_report: 'cbt_sed',
  change_request: 'change_enablement',
  cod_chain: 'cod',
  control_environment_audit: 'audit',
  credit_facility_application: 'credit_origination',
  crediting_period_renewal: 'crediting_renewal',
  demand_response_event: 'demand_response',
  disbursement_case: 'disbursement',
  fsca_compliance_report: 'fsca_compliance',
  gca_connection: 'gca',
  green_bond_report: 'green_bond',
  imbalance_settlement: 'imbalance',
  ipp_aud: 'audit',
  ipp_doc_control: 'ipp_document_control',
  ipp_fm: 'force_majeure_claim',
  kyc_verification: 'kyc',
  market_abuse_case: 'market_abuse',
  milestone_variance_report: 'milestone_variance',
  mrv_submissions: 'carbon_mrv',
  om_work_order: 'wo',
  ppa_contract_chain: 'ppa_contract',
  ppa_payment_security: 'payment_security',
  ppa_take_or_pay: 'take_or_pay',
  problem_record: 'problem_management',
  procurement_rfp: 'procurement',
  rez_capacity: 'grid_capacity_allocation',
  slb_kpi_ratchet: 'slb_kpi',
  support_tickets: 'support_ticket',
  trade_report: 'trade_reporting',
};

/** Written status-mapping decisions (CUTOVER_COVERAGE §1 header rule): v1
 *  statuses with no same-name v2 state map to the nearest v2 state by lifecycle
 *  position. The original v1 status survives verbatim in payload.row — the
 *  mapping only picks which v2 state the txn resumes in (and therefore which
 *  timers arm). Unmapped unknown statuses still quarantine. */
export const STATUS_MAP: Record<string, Record<string, string>> = {
  ccp_assessment: {
    requested: 'initiated', // request lodged = initial risk-held opening state
    eligibility_check: 'initiated', // pre-diligence gate = still the opening step, risk-held
    screening: 'assessing', // screening = diligence underway; assessing is the only diligence state
    assessment_in_progress: 'assessing', // mid-diligence, risk-held
    ccp_decision_pending: 'assessing', // approve/decline decision pending = still in assessing, no separate decision state
    vvb_review: 'under_review', // independent-body review ≈ periodic review, risk-held non-terminal
    on_hold: 'suspended', // only non-terminal hold state; lossy, v1 status in payload.row
    returned: 'initiated', // sent back to applicant = restart at opening step
    ccp_label_granted: 'approved', // admission granted
    ccp_label_denied: 'declined', // terminal admission failure
  },
  disposition: {
    received: 'disposition_requested', // request received = initial lender-held inbox
    triaged: 'under_review', // moved past inbox into active lender review
    assigned: 'under_review', // assigned to a reviewer = lender reviewing
    investigating: 'under_review', // lender reviewing
    referred: 'under_review', // referred on = still under review, non-terminal
    escalated: 'under_review', // escalated = still live lender review, non-terminal
    action_required: 'conditions_pending', // borrower must act = CP pending, borrower-held
    action_in_progress: 'consent_granted', // borrower executing the consented disposal, borrower-held window
    action_completed: 'completed', // terminal — disposal done
    closed: 'completed', // terminal close = completed
  },
  poslimit_case: {
    within_limit: 'cured', // position back inside cap = resolved inside limit = cured (terminal)
  },
  dfr: {
    drafted: 'entries_open', // report being drafted = initial entries-open, ipp-held
  },
  unserved_energy_claim: {
    claim_submitted: 'lodged', // claim submitted = initial lodged, grid-operator-held
    metering_data_verified: 'metering_verified', // meter data verified
    preliminary_quantum: 'quantum_determined', // preliminary quantum = quantum-determined stage, grid-held
    grid_operator_response: 'grid_response_filed', // grid operator filed its response
    negotiation: 'negotiating', // negotiation underway
    settlement_offer: 'settlement_offered', // offer on the table, offtaker-held
    claim_disputed: 'adjudication', // dispute = adjudication (dispute_claim edge -> adjudication)
    formal_adjudication: 'adjudication', // formal adjudication in progress
  },
  ipp_acs: {
    assessment_triggered: 'self_assessment_drafted', // triggered = opening = drafted, initial ipp-held
    protection_systems_audit: 'protection_audit_underway', // protection audit underway
    metering_scada_audit: 'metering_scada_audit_underway', // metering/SCADA audit underway
    reactive_power_audit: 'reactive_power_audit_underway', // reactive power audit underway
    frequency_response_audit: 'frequency_response_audit_underway', // frequency response audit underway
    frt_pq_audit: 'frt_pq_audit_underway', // FRT/PQ audit underway
    internal_technical_review: 'internal_review_complete', // no in-progress internal-review state; collapses to the only internal-review state, lossy
    so_review_in_progress: 'so_review_underway', // SO review underway
    so_submission: 'submitted_to_so', // formal handover to SO
  },
  ipp_ccc: {
    load_flow_study: 'ccc_initiated', // operator technical study to price the work = pricing/initiation phase, operator-held
    cost_assessment: 'ccc_initiated', // operator costing the strengthening work = initiation phase
    negotiation_in_progress: 'ccc_initiated', // negotiating pre-heads-of-terms; still in the initiated phase
    ipp_review: 'provisional_agreement', // IPP reviewing proposed terms = provisional round, ipp-held
    arbitration_in_progress: 'dispute_filed', // arbitration = live dispute process, non-terminal
    expert_determination: 'dispute_filed', // expert determination = live dispute-resolution process, non-terminal (NERSA determ. is the terminal one)
  },
  ipp_cd: {
    default_identified: 'default_raised', // identification = the initial raise, ipp-held
    cure_period_in_progress: 'cure_period', // v1 in-progress = the cure_period state; re-arms 42d cure-lapse time-bar
    replacement_tendering: 'handover_in_progress', // tendering runs inside handover, pre-award; re-arms 30d
  },
  ipp_coc: {
    notification_submitted: 'notified', // initial; notification lodged = notified
    completeness_check: 'completeness_review',
    competition_screen: 'completeness_review', // NERSA screening collapses into the review window, re-arms 10d; v1 status in payload.row
    foreign_ownership_screen: 'completeness_review', // ditto — evaluation sub-stage, no dedicated v2 state
    nersa_evaluation: 'completeness_review', // ditto
    technical_assessment: 'completeness_review', // ditto
    conditional_approval: 'conditionally_approved',
    appeal_filed: 'rejected', // no appeal state; appeal contests a refusal, nearest terminal is rejected; appeal survives in payload.row
  },
  ipp_ctr: {
    report_due: 'report_drafted', // obligation triggered pre-draft; earliest v2 state (initial)
    data_preparation: 'report_drafted', // IPP data prep = drafting stage, ipp-held
    trustee_review: 'report_drafted', // internal trust review pre-submission = ipp-held drafting
    submitted_to_dtic: 'dtic_review', // submission arms the DTIC review window
    ipp_review: 'dtic_review', // IPP addressing DTIC queries during the review cycle
    responses_submitted: 'dtic_review', // responses land inside the review window, re-arms 30d
    appeal_filed: 'report_rejected', // no filed-appeal state; pending appeal sits at rejected, determine_appeal resolves it; appeal in payload.row
  },
  ipp_empr: {
    report_period_opened: 'report_opened',
    monitoring_results_compilation: 'monitoring_compiled', // in-progress compile = the compiled stage
    incident_review: 'incident_reviewed',
    draft_report_preparation: 'draft_report_prepared',
    internal_review: 'internal_review_completed',
    eco_sign_off: 'eco_signed_off',
    ca_review_in_progress: 'ca_review_commenced', // v2 has no in-progress state; commenced is the CA-review stage
    competent_authority_submission: 'submitted_to_ca', // submission = submitted_to_ca, regulator-held, re-arms 120d
  },
  ipp_env_monitoring: {
    report_drafted: 'compliance_assessed', // v1-dead status; draft sits post-assessment pre-submission, nearest non-terminal is compliance_assessed
  },
  ipp_eqt: {
    transfer_initiated: 'transfer_proposed', // initiation = the initial proposal
    due_diligence: 'transfer_proposed', // pre-submission DD, ipp-held proposal stage
    offtaker_notification: 'transfer_proposed', // pre-submission notification, still proposal stage
    lender_consent_requested: 'transfer_proposed', // CP gathered to complete the application, pre-submission
    regulatory_notification: 'nersa_review', // notifying NERSA = review commenced, re-arms 14d
    cp_documentation_submitted: 'nersa_review', // CP docs filed during review
    conditions_precedent_tracking: 'nersa_review', // CP tracking pre-completion; no dedicated state
    regulatory_clearance_issued: 'nersa_review', // cleared but unexecuted = completion pending, re-arms 14d; v1 status in payload.row
  },
  ipp_esmr: {
    data_collection: 'reporting_period_open', // E&S data collection during the open period, ipp-held
    monitoring_compilation: 'reporting_period_open', // pre-submission compile, ipp-held
    ta_report_preparation: 'reporting_period_open', // report prep pre-submission, ipp-held
    lender_review: 'report_submitted', // lender reviewing the submitted report, admin-held, re-arms 14d
    lender_ta_review: 'report_submitted', // lender-TA review, post-submission window
    clarification_requested: 'report_submitted', // clarification during review; report still submitted, re-arms 14d
  },
  ipp_final_completion: {
    defects_outstanding: 'snag_list_issued', // a snag list IS the outstanding-defects record; EPC-held cure window
    snag_list_cleared: 'inspection_complete', // cure done, back to IE ready-to-certify position; re-arms 5d IE clock
  },
  ipp_gcc: {
    assessment_due: 'assessment_open', // not yet opened; earliest developer-held state
    test_preparation: 'assessment_open', // pre-submission developer prep work
    testing_in_progress: 'assessment_open', // testing is assessment-phase work, pre-submission
    test_completed: 'assessment_open', // tests done, report not yet submitted to NERSA
    report_drafted: 'assessment_open', // drafting report, still developer-held pre-submission
    submitted_to_nersa: 'under_nersa_review', // submitted = NERSA now reviewing
    nersa_review: 'under_nersa_review', // NERSA reviewing, re-arms 30d
    verification_pending: 'under_nersa_review', // awaiting NERSA verification within the review window
    corrective_action: 'deficiency_noted', // curing a noted deficiency; re-arms 30d corrective window
  },
  ipp_insr: {
    broker_instruction: 'renewal_triggered', // broker instructed but cover not yet placed; developer-held pre-placement
    documentation_preparation: 'renewal_triggered', // pre-placement prep, re-arms 5d
    coverage_gap_analysis: 'renewal_triggered', // pre-placement gap review
    documents_submitted: 'market_placement', // risk submitted to market = placed
    terms_received: 'market_placement', // market returned terms; post-placement confirmation phase
    lender_confirmation_requested: 'market_placement', // post-placement, awaiting lender confirmation
    ipp_lender_review: 'market_placement', // lender reviewing placed cover, pre-resolution
  },
  ipp_lam: {
    amendment_requested: 'amendment_drafted', // request = initial developer-held drafting
    surveyor_appointed: 'amendment_drafted', // survey is developer prep, pre-submission
    survey_completed: 'amendment_drafted', // survey done, application not yet submitted
    authority_review: 'application_submitted', // authority reviewing = post-submission, holder matches (30d)
    objections_resolved: 'application_submitted', // objections cleared, still within authority review
    appeal_filed: 'application_submitted', // active appeal = authority re-reviewing; non-terminal, authority-held
  },
  ipp_lrep: {
    reporting_triggered: 'package_drafted', // cycle opened; initial developer-held drafting
    data_collection: 'package_drafted', // drafting-phase data gathering
    financial_model_update: 'package_drafted', // drafting-phase model work
    document_compilation: 'package_drafted', // compiling the package, pre-submission
    technical_review: 'package_drafted', // internal review pre-submission, developer-held
    ipp_sign_off: 'package_drafted', // developer sign-off before submission, still pre-submission
    agent_bank_submission: 'package_submitted', // submitted to agent bank = admin-held awaiting response
    lender_distribution: 'package_submitted', // package distributed to lenders = out the door
    acknowledgement_pending: 'package_submitted', // awaiting acknowledgement; re-arms 30d SLA
  },
  ipp_lta: {
    site_inspection_in_progress: 'certificate_requested', // LTA review work before a draft is issued; admin-held
    progress_assessment: 'certificate_requested', // pre-draft LTA assessment
    borrower_comments_submitted: 'draft_certificate_issued', // comments on the draft = draft review phase, developer-held
    final_certificate_in_review: 'draft_certificate_issued', // draft under final review, pre-resolution
  },
  ipp_mc: {
    milestone_triggered: 'milestone_scheduled', // initial developer-held scheduled state
    documentation_preparation: 'milestone_scheduled', // developer prep, review not yet commenced
    documentation_submitted: 'milestone_scheduled', // docs in, still pre-commencement developer phase
    ipp_office_acknowledgment: 'final_review', // office acknowledged receipt = review commenced
    ie_pre_review: 'final_review', // IE pre-review = final review underway
    technical_verification: 'final_review', // verification within the review window
    clarification_requested: 'final_review', // clarification sought mid-review; re-arms 14d
  },
  ipp_omc: {
    renewal_triggered: 'tendering', // opening trigger = start of the round
    market_sounding: 'tendering', // pre-bid soundings still within the tender window
    tender_issued: 'tendering', // tender out, bids not yet in
    bids_received: 'tendering', // bids in but not yet evaluated/selected
    evaluation_complete: 'tendering', // evaluated, preferred bidder not yet named
    lender_consent: 'preferred_bidder_selected', // post-selection consent step, pre-execution
    nersa_acknowledgement: 'preferred_bidder_selected', // regulator ack sits between selection and execution
    novation_pending: 'preferred_bidder_selected', // bidder chosen, novation executing but not yet done
  },
  ipp_ppavar: {
    variation_requested: 'variation_lodged', // request = the lodge/open stage
    regulatory_screen: 'regulatory_screening', // same stage, v1 short form
  },
  ipp_psec: {
    security_required: 'application_submitted', // requirement identified = earliest non-terminal (initial)
    bond_application_submitted: 'application_submitted', // same stage, v1 verbose form
    bond_documentation: 'documentation', // same doc-prep stage
    dmre_notification_sent: 'dmre_notified', // same DMRE-notified stage
  },
  ipp_qgr: {
    report_quarter_opened: 'report_drafted', // opening trigger = drafting stage (initial)
    operations_data_collection: 'report_drafted', // draft-phase data gathering, ipp-held
    environmental_data_compilation: 'report_drafted', // draft-phase compilation
    financial_data_compilation: 'report_drafted', // draft-phase compilation
    social_indicators_tabulation: 'report_drafted', // draft-phase compilation
    internal_review: 'report_drafted', // pre-submission internal review, still drafting
    board_approval: 'report_drafted', // internal sign-off before submission
    ipp_office_submission: 'submitted_to_ipp_office', // same submit stage
    acknowledgement_pending: 'submitted_to_ipp_office', // submitted, awaiting office ack/decision
  },
  ipp_tq: {
    logged: 'raised', // bookkeeping shade of raised (per chain note)
    under_review: 'allocated', // bookkeeping shade of allocated (per chain note)
    acknowledged: 'response_issued', // bookkeeping shade of response_issued (per chain note)
    design_change_required: 'response_drafted', // substantive response outcome awaiting approve/issue
  },
  ipp_wul: {
    application_preparation: 'wul_application_triggered', // drafting = initial "Application drafting"
    site_assessment: 'technical_assessment', // DWS assessing the site = technical stage
    public_participation_closed: 'technical_assessment', // participation window ended, now assessing
    dws_final_review: 'technical_assessment', // final DWS review = the technical-assessment stage
  },
  availability_guarantee: {
    settled: 'remedy_instructed',
    dispute_resolved: 'met_closed',
    measurement_submitted: 'measured',
    adjustment_review: 'measured', // non-terminal; adjustment still part of buyer's measurement assessment, re-arms 14d
    reconciled: 'measured', // reconciled but outcome (met/shortfall) not yet assessed
    meets_guarantee: 'met_closed',
    shortfall_flagged: 'shortfall_computed', // non-terminal; provider owes remedy, re-arms 30d
    ld_assessed: 'remedy_instructed', // LD assessment = remedy determined; settlement-honesty: instruction only, no custody
    cure_period: 'shortfall_computed', // non-terminal; provider curing = provider-held pre-remedy window
  },
  best_execution: {
    closed: 'attested',
    exception_escalated: 'rejected',
    rfq_expired: 'cancelled',
    rfq_received: 'drafted', // v2 models the best-ex attestation, not the trade; pre-quote stages collapse to trader-held draft
    quotes_solicited: 'drafted', // lossy collapse; v1 status in payload.row
    quotes_received: 'drafted', // trader still assembling evidence
    best_ex_evaluated: 'submitted', // evaluation complete = report goes to compliance
    execution_approved: 'under_review', // compliance-held approval stage
    executed: 'under_review', // executed but not yet TCA-reviewed = attestation pending (closed -> attested per §4.2)
    override_executed: 'flagged', // best-ex override is a deficiency needing justification
    tca_reviewed: 'attested', // TCA review complete = attestation done
  },
  black_start: {
    recertified: 'certified', // non-terminal — re-arms test timers
    contract_terminated: 'decertified',
    needs_assessed: 'capability_declared',
    solicitation_issued: 'capability_declared', // v2 has no procurement stage; pre-bid collapses to start
    bid_evaluation: 'under_assessment',
    contract_awarded: 'under_assessment', // awarded but unexecuted; v2 has no award stage, v1 status in payload.row
    contract_executed: 'certified', // non-terminal; executed contract = in restoration plan (matches contract_terminated->decertified precedent)
    drill_scheduled: 'test_scheduled',
    drill_in_progress: 'test_scheduled', // non-terminal; v2 has no in-progress state, witnessed only after completion
    drill_completed: 'test_witnessed', // non-terminal; completed drill awaiting certification decision
    drill_failed: 'decertified', // failed drill ends certification; re-drill re-initiates, v1 status in payload.row
  },
  carbon_budget: {
    final: 'closed',
    appeal: 'rejected',
  },
  carbon_credit_rating: {
    re_rated: 'published',
    escalated_to_integrity: 'rating_declined',
    downgraded: 'published',
    desk_review: 'under_assessment',
    methodology_score: 'under_assessment', // all five scoring pillars collapse into assessment; v1 status in payload.row
    additionality_score: 'under_assessment',
    permanence_score: 'under_assessment',
    leakage_score: 'under_assessment',
    cobenefit_score: 'under_assessment',
    composite_score: 'committee_review', // scoring done, final review before publish
    monitoring: 'published', // non-terminal in spirit but v2 published is the in-force state (re_rated->published precedent)
    re_rating_triggered: 'under_assessment', // non-terminal; back into assessment, re-arms 5d
  },
  carbon_erpa: {
    completed: 'delivery_confirmed',
    withdrawn: 'negotiation_failed',
    erpa_drafted: 'negotiating',
    delivery_verified: 'delivery_confirmed',
    erpa_executed: 'executed', // non-terminal; re-arms 7d schedule-delivery SLA
    delivery_initiated: 'delivery_scheduled', // non-terminal; delivery in flight
    shortfall_flagged: 'delivery_shortfall',
    make_good_pending: 'delivery_scheduled', // non-terminal; make-good re-delivery pending, re-arms 365d
    disputed: 'delivery_shortfall', // v2 has no ERPA dispute state; shortfall outcome recorded, dispute survives in payload.row
  },
  carbon_issuance: {
    cancelled: 'withdrawn',
    screening: 'under_review',
    verification_check: 'under_review', // MRV still being checked; verified = check passed
    serialization: 'verified', // non-terminal; verified, credits being serialized pre-issue
    pending_registry: 'verified', // non-terminal; awaiting registry mint, re-arms 5d
    on_hold: 'under_review', // non-terminal; hold = paused review, v1 status in payload.row
    returned: 'requested', // sent back to proponent; restarts at request stage
    disputed: 'under_review', // no dispute state; unresolved stays in review, v1 status in payload.row
  },
  carbon_registration: {
    crediting_active: 'registered',
    pin_submitted: 'project_submitted',
    pdd_drafted: 'info_requested', // non-terminal; proponent-held doc-prep matches holder+position (60d)
    validation_underway: 'validation',
    corrections_required: 'info_requested', // non-terminal; proponent must fix
    public_consultation: 'validation', // consultation runs within the validation window
    dna_authorization: 'registry_review', // post-validation authority step collapses into registry review
    registration_requested: 'registry_review', // request lodged, registry deciding; approved state comes after
  },
  carbon_registry_transfer: {
    ca_notified: 'transferred',
    completed: 'transferred',
    aml_rejected: 'rejected',
    registry_rejected: 'rejected',
    cancelled: 'withdrawn',
  },
  carbon_retirement: {
    cancelled: 'withdrawn',
    requested: 'submitted', // request lodged at registry
    validating: 'submitted', // non-terminal; registry validating, re-arms 5d
    adjustment_pending: 'submitted', // non-terminal; corresponding-adjustment pending, still registry-held
    adjusted: 'retired', // adjustment applied = retirement effective
  },
  carbon_reversal: {
    closed: 'compensated',
    escalated: 'under_assessment', // non-terminal
    false_alarm: 'rejected',
    reversal_reported: 'reported',
    loss_quantified: 'under_assessment', // quantification is part of assessment
    buffer_cancelled: 'compensated', // buffer-pool cancellation = compensation done (closed->compensated precedent)
    replacement_required: 'compensation_pending', // non-terminal; replacement owed
    replacement_submitted: 'compensation_pending', // non-terminal; awaiting verification, re-arms 5d
    replacement_verified: 'compensated',
  },
  certificate_bundle: {
    retired: 'bundle_closed',
    expired: 'withdrawn',
    cancelled: 'withdrawn',
  },
  complaint_resolution: {
    appealed: 'escalated',
    complaint_lodged: 'lodged',
    admissibility_review: 'acknowledged', // post-lodge screening = handler acknowledgement stage
    referred_to_licensee: 'under_investigation', // licensee response is part of investigation
    mediation: 'resolution_proposed', // non-terminal; settlement process = proposal stage, re-arms 10d
    adjudication_hearing: 'escalated', // left informal resolution for formal adjudication (appealed->escalated precedent)
    ruling_issued: 'resolved', // ruling = outcome issued; v1 status in payload.row
  },
  compliance_inspection: {
    compliant_closed: 'closed_compliant',
    enforcement_closed: 'referred_enforcement',
    withdrawn: 'cancelled',
    inspection_in_progress: 'inspection_conducted', // v2 has no in-progress state; conducted is the inspection stage (3d regulator)
    findings_drafted: 'inspection_conducted', // non-terminal; regulator drafting pre-issue
    directive_issued: 'findings_issued', // directive to licensee = findings served, re-arms 14d
    remediation_underway: 'findings_issued', // non-terminal; licensee-held remediation window
    penalty_imposed: 'referred_enforcement', // penalty = enforcement outcome (enforcement_closed precedent)
  },
  connection_energization: {
    commercial_operation: 'energized',
    connection_withdrawn: 'withdrawn',
    connection_ready: 'energization_requested', // v1 chain opens pre-programme; earliest v2 state
    program_review: 'energization_requested', // operator reviewing programme, holder matches
    program_approved: 'inspection', // programme approved; inspection is the next v2 gate
    pre_energization_inspection: 'inspection',
    energization_authorized: 'cleared_to_energize',
    cold_commissioning: 'cleared_to_energize', // cleared but not yet synced; v2 has no commissioning sub-state
    synchronized: 'energized', // grid-synced = energized; v2 merged the commissioning tail
    compliance_testing: 'energized', // post-sync testing; lossy — v1 status survives in payload.row
    commissioning_suspended: 'defect_hold', // failed hold-point ≈ defect hold
  },
  construction_cost_report: {
    budget_compliant: 'certified',
    resolved: 'certified',
    default_triggered: 'rejected',
    cancelled: 'withdrawn',
    cost_overrun_risk: 'under_review', // v1 SLA-breach escalation flag on an active un-certified report; non-terminal, v1 status in payload.row
  },
  counterparty_margin: {
    recovered: 'margin_posted_instructed',
    written_off: 'defaulted',
    limit_active: 'computed', // steady-state monitoring with requirement in place
    exposure_warning: 'computed', // pre-call warning; v1 status in payload.row
    margin_call_issued: 'margin_called',
    collateral_received: 'margin_posted_instructed', // precedent: recovered -> margin_posted_instructed
    position_restriction: 'margin_called', // post-call escalation, collateral still outstanding; re-arms 24h SLA
    cure_period: 'margin_called', // cure window = call still open on counterparty
    default_declared: 'defaulted',
    close_out: 'defaulted', // default-waterfall stage; v1 status in payload.row
    default_fund_draw: 'defaulted', // default-waterfall stage; v1 status in payload.row
  },
  cp_clearance: {
    expired: 'cp_defaulted',
  },
  credit_insurance: {
    claim_paid: 'claim_instructed',
    lapsed: 'expired',
  },
  cross_border_trade: {
    trade_executed: 'delivered',
    fsca_rejected: 'rejected',
    sarb_rejected: 'rejected',
    expired: 'cancelled',
  },
  curtailment_claim: {
    compensation_settled: 'compensated_instructed',
    // v2 'rejected' is a non-terminal appeal state — dismissed is the terminal
    arbitrated: 'dismissed',
    non_compensable: 'dismissed',
    curtailment_logged: 'raised',
    classification_review: 'raised', // grid classifying, pre-validation; holder grid matches
    claim_submitted: 'raised', // v2 'validated' means validation DONE; claim still with grid
    validation_underway: 'raised', // same — validation incomplete; re-arms 48h grid SLA
    quantum_proposed: 'quantified',
    disputed: 'in_dispute',
  },
  cyber_incident: {
    detected: 'reported',
    investigating: 'triaged',
    escalated: 'triaged',
    // POPIA s22 notifications happen post-containment in the v1 flow
    notified_regulator: 'contained',
    notified_subjects: 'contained',
    remediation_planned: 'eradicated',
    remediation_executing: 'eradicated',
    verified: 'recovered',
    false_alarm: 'dismissed',
  },
  hse_incident: {
    notified_authority: 'investigating',
    escalated: 'triaged',
    corrective_actions_planned: 'corrective_actions_assigned',
    corrective_actions_executing: 'corrective_actions_assigned',
    verified: 'corrective_actions_verified',
    false_alarm: 'dismissed',
  },
  drawdown: {
    // 'disbursed' is a declared settlement-honesty terminal with no live edge —
    // legacy import is its only legitimate writer (Store.commit, not applyTransition)
    closed: 'disbursed',
    cancelled: 'withdrawn',
    requested: 'submitted', // request lodged with lender; v2 draft is pre-submission
    documents_submitted: 'submitted',
    ie_review: 'submitted', // IE review is lender-side review; holder lender
    cp_checklist: 'conditions_pending',
    on_hold: 'conditions_pending', // v1 hold resumes to cp_checklist; nearest v2 hold state
    funded: 'disbursed', // settlement-honesty terminal; legacy import is its only legit writer (precedent: closed -> disbursed)
  },
  ed_commitment: {
    closed: 'commitment_closed',
    false_alarm: 'monitoring', // variance flag was spurious (stale-data reconciliation); commitment resumes monitoring, v1 status in payload.row
  },
  enforcement_action: {
    paid: 'resolved',
    case_opened: 'notice_issued', // pre-notice case work; earliest v2 state
    allegations_drafted: 'notice_issued', // pre-service drafting; v1 status in payload.row
    allegations_served: 'notice_issued', // served = respondent's representations clock running
    representations_period: 'notice_issued', // respondent drafting representations; holder respondent, 14d
    hearing_held: 'under_representation', // regulator deliberating post-hearing, pre-determination
    determination: 'determination_made',
    penalty_imposed: 'remediation_pending', // awaiting payment/compliance (precedent: paid -> resolved)
    appealed: 'determination_made', // no v2 appeal state; back with regulator, re-arms 7d
    enforced_via_court: 'resolved', // penalty enforced through court = case concluded
  },
  enforcement_action_s35: {
    settled: 'action_closed',
    archived: 'action_closed',
    cancelled: 'withdrawn',
    triggered: 'notice_issued', // pre-notice trigger; earliest v2 state
    notice_drafted: 'notice_issued',
    respondent_acknowledged: 'notice_issued', // acknowledged, representations still due; holder respondent
    response_received: 'representations_made',
    adjudication_in_progress: 'under_review',
    adjudicated: 'determination_made',
    sanction_imposed: 'remediation_pending', // sanction issued, compliance outstanding
    appeal_window_open: 'determination_made', // post-determination window; re-arms 7d
    appealed: 'under_review', // appeal re-opens regulator review
    re_adjudicated: 'determination_made',
    enforcement_in_progress: 'remediation_pending',
  },
  eop_activation: {
    per_completed: 'eop_closed',
    per_outstanding: 'post_event_review',
    escalated_to_regulator: 'eop_closed',
    withdrawn: 'stood_down',
  },
  esap_compliance: {
    accepted: 'compliant',
    verified: 'compliant',
    data_collection: 'monitoring_period_open',
    site_verification: 'monitoring_period_open', // pre-report field work; holder developer
    draft_report: 'monitoring_period_open', // report not yet submitted
    lender_review: 'report_submitted', // report with monitor/lender for review
    minor_findings: 'findings_review', // severity survives in finding_count_minor + payload.row
    major_findings: 'findings_review', // severity survives in finding_count_major + payload.row
    action_plan_required: 'remediation_required',
    action_plan_submitted: 'remediation_submitted',
  },
  esg_disclosure: {
    archived: 'published',
    cancelled: 'withdrawn',
    period_open: 'data_collection',
    data_collected: 'data_collection', // v2 merged collection/verification/computation
    boundary_verified: 'data_collection',
    metrics_computed: 'data_collection', // draft not yet compiled
    draft_compiled: 'internal_review', // draft exists; internal review is next v2 step
    assurance_engaged: 'under_assurance',
    assurance_in_progress: 'under_assurance',
    assured: 'board_review', // assurance done, pre-publish governance
    filed: 'published', // v1 filed is post-published; nearest terminal
    disputed: 'internal_review', // v1 resolve_dispute returns to internal_review; nearest non-terminal
  },
  export_curtailment: {
    settled: 'closed',
    rejected: 'disputed',
    withdrawn: 'cancelled',
  },
  fsca_conduct_report: {
    accepted: 'closed',
    escalated: 'closed',
  },
  grid_code_compliance: {
    compliant_closed: 'resolved',
    disconnection_issued: 'enforcement_referred',
    monitoring: 'nc_raised', // v2 chain opens at the NC; earliest state, v1 status in payload.row
    non_conformance_raised: 'nc_raised',
    corrective_action_required: 'remediation_required',
    cap_submitted: 'remediation_submitted', // CAP with operator for review; v2 merged CAP + evidence review
    cap_approved: 'remediation_required', // plan approved, remediation executing; back to holder responsible
    remediation_in_progress: 'remediation_required',
    operating_restriction: 'remediation_required', // restriction imposed while responsible party remediates; v1 status in payload.row
  },
  handover_dossier: {
    archived: 'handed_over',
    rejected: 'dossier_rejected',
    voided: 'withdrawn',
    dossier_compiled: 'dossier_drafting', // compiled but not yet submitted; re-arms 30d drafting SLA
    submitted: 'submitted_for_review',
    revision_required: 'rectification_required', // rename
    approved: 'accepted', // non-terminal; arms 3d handover SLA
    witnessed_acceptance_scheduled: 'accepted', // v2 collapses witnessed-acceptance into accepted->handed_over; v1 status in payload.row
    witnessed_acceptance: 'accepted', // acceptance witnessed, ops transfer still pending
    training_transferred: 'accepted', // training done but operations not yet owning; last pre-handover step
    operations_owned: 'handed_over', // terminal: ops ownership = handed over
    warranty_activated: 'handed_over', // post-handover step; v1 status in payload.row
  },
  interconnector_schedule: {
    cancelled: 'withdrawn',
  },
  ipp_evm: {
    // v1 change-request flow ≈ v2 reforecast flow
    CR_logged: 'variance_detected',
    CR_approved: 'reforecast_published',
    contingency_drawn: 'reforecast_published',
  },
  ipp_schedule: {
    completed: 'schedule_completed',
    cancelled: 'schedule_cancelled',
    late_finish: 'schedule_completed',
    wbs_drafted: 'schedule_drafted',
    baseline_set: 'baseline_active',
    in_progress: 'baseline_active', // execution under active baseline
    status_updated: 'baseline_active', // progress updates are field writes, not states, in v2
    variance_detected: 'baseline_active', // variance is data under the active baseline; v1 status in payload.row
    impact_assessed: 'baseline_active', // assessment pre-dates any rebaseline submission
    rebaselined: 'baseline_active', // re-baseline done => new baseline active (rebaseline_review is the pending case)
    recovered: 'baseline_active', // back on plan
    suspended: 'baseline_active', // v2 has no suspended state; non-terminal live state, v1 status in payload.row (isda_agreement precedent)
  },
  isda_agreement: {
    active: 'executed', // non-terminal live state
    suspended: 'executed', // v1 status survives in payload.row
  },
  itp: {
    archived: 'itp_closed',
    rejected: 'itp_rejected',
    voided: 'withdrawn',
    submitted: 'under_review', // submitted for engineer review
    approved: 'itp_approved',
    in_inspection: 'inspection_in_progress',
    witness_attended: 'inspection_in_progress', // witness point attended mid-programme; counts live in fields
    passed: 'inspection_complete', // non-terminal; arms 48h close SLA
    corrective_action: 'under_review', // matches v2 raise_ncr edge (inspection -> under_review rework loop)
    failed: 'itp_rejected', // terminal failure; detail in payload.row
  },
  levy_assessment: {
    settled: 'levy_settled',
    written_off: 'assessment_waived',
    withdrawn: 'assessment_withdrawn',
    levy_assessed: 'draft_assessment', // assessed but pre-issue (v1 review still follows)
    assessment_review: 'draft_assessment', // internal regulator review pre-issue
    invoiced: 'payment_pending', // billed => payment due; re-arms 30d payment SLA
    objection_review: 'under_objection', // rename
    partially_paid: 'payment_pending', // balance outstanding; v1 status in payload.row
    in_arrears: 'payment_pending', // overdue, still collectible
    final_demand: 'payment_pending', // dunning step within payment_pending
    enforcement: 'payment_pending', // v2 has no enforcement state; live collections case, v1 status in payload.row
  },
  licence_renewal: {
    granted: 'renewal_granted', // non-terminal — arms 14d issue SLA
    amended: 'renewal_issued',
    renewal_initiated: 'renewal_requested',
    application_filed: 'renewal_requested', // filing = the request; arms 5d start SLA
    completeness_check: 'compliance_review', // nearest review stage
    public_consultation: 'evaluation', // consultation is part of the v2 evaluation phase
    decision_drafted: 'renewal_decision', // decision pending council
    council_voted: 'renewal_decision', // vote outcome not derivable from status alone; operator re-drives grant/refuse, v1 status in payload.row
  },
  load_curtailment: {
    closed: 'curtailment_complete',
    refused: 'non_compliance',
    withdrawn: 'directive_cancelled',
    instruction_issued: 'directive_issued', // rename; re-arms 2h no-ack time_bar
    curtailment_started: 'curtailment_active',
    target_achieved: 'curtailment_active', // target met, curtailment still standing
    partial_compliance: 'curtailment_active', // live event; v1 status in payload.row (non_compliance is the terminal for refusal)
    instruction_lifted: 'restoration_pending', // lifted => load restoration underway
    reconciled: 'curtailment_complete',
    post_mortem: 'curtailment_complete', // post-event review; v1 status in payload.row
  },
  loan_default: {
    restructured: 'waived',
    enforced_closed: 'enforced',
    written_off: 'enforced',
    default_flagged: 'default_declared', // v2 has no pre-declaration stage; re-arms 30d cure time_bar
    under_review: 'default_declared', // lender assessment pre-notice; v1 status in payload.row
    default_notice_issued: 'default_declared', // the notice IS the declaration
    cure_period: 'cure_in_progress', // rename
    accelerated: 'enforcement_pending', // acceleration = enforcement elected
    enforcement_commenced: 'enforcement_pending', // commenced but not complete (v2 enforced = enforcement complete)
  },
  loan_restructure: {
    restructure_proposal_drafted: 'proposal_drafted',
    lender_credit_committee_review: 'committee_review',
    borrower_term_sheet_negotiation: 'term_negotiation',
    legal_documentation_drafted: 'legal_documentation',
    effective_date: 'effective',
  },
  loan_transfer: {
    completed: 'transfer_registered',
    declined: 'transfer_declined',
    rejected: 'transfer_declined',
    withdrawn: 'transfer_withdrawn',
    transfer_requested: 'transfer_proposed',
    kyc_screening: 'transfer_proposed', // pre-consent diligence; re-arms 30d consent time_bar
    screening_remediation: 'transfer_proposed', // still pre-consent; v1 status in payload.row
    consent_solicitation: 'transfer_proposed', // consent not yet obtained
    regulatory_review: 'consent_obtained', // consents in, regulatory CP outstanding; arms 15d CP SLA
    transfer_approved: 'cp_satisfied', // approved => ready to execute
    certificate_executed: 'transfer_executed', // rename
    settled: 'transfer_registered', // terminal
  },
  market_conduct_exam: {
    enforcement_action: 'referred_enforcement',
    closed_satisfactory: 'closed',
    withdrawn: 'cancelled',
  },
  oem_fco: {
    completed: 'closed',
    withdrawn: 'cancelled',
    draft: 'issued', // v2 has no OEM-side authoring states; v1 status in payload.row
    under_review: 'issued', // pre-issue review collapsed into issued
    approved: 'issued', // approved but operators not yet notified
    population_identified: 'issued', // fleet population is field data in v2
    notification_sent: 'issued', // notification = issuance to operator; re-arms 48h ack SLA
    scheduling: 'acknowledged', // actively arranging rollout = acknowledged's 72h schedule SLA
    suspended: 'scheduled', // v2 has no suspended state; rollout on hold pre-restart, v1 status in payload.row
  },
  planned_outage: {
    rejected: 'request_rejected',
    closed: 'returned_to_service',
    draft: 'outage_requested', // v2 has no draft state; re-arms 24h triage SLA
    submitted: 'under_review',
    approved: 'window_approved',
    rescheduled: 'window_approved', // new window approved; v1 status in payload.row
    notified: 'window_approved', // stakeholder notification pre-start, still approved-awaiting-window
    in_progress: 'outage_in_progress', // re-arms 7d begin_restoration time_bar
    restoring: 'restoration_pending', // rename
    restored: 'returned_to_service', // terminal
  },
  pm_compliance: {
    closed: 'completed',
    pm_scheduled: 'work_assigned', // scheduled = assigned; re-arms 24h start SLA
    on_hold: 'deferred', // hold = deferral granted; v1 status in payload.row
    verification_pending: 'in_progress', // v2 has no verify state; only complete_pm from in_progress reaches completed
  },
  poa_cpa_inclusion: {
    excluded: 'rejected',
    completed: 'included',
    cpa_proposed: 'inclusion_requested',
    inclusion_review: 'doe_validation', // final pre-inclusion review; v2's last review stage
    monitoring: 'included', // v1 post-inclusion monitoring loop; v2 lifecycle ends at inclusion (payload keeps status)
    verified: 'included', // same collapse — verified is a monitoring-loop rest state after inclusion
  },
  ppa_annual_recon: {
    settled: 'settled_instructed',
    restated: 'computed', // non-terminal — re-arms agree/dispute timers
    year_opened: 'initiated',
    data_collected: 'data_gathering', // non-terminal; data in but compute pending — v2 computed implies compute done
    variance_classified: 'computed', // v1 compute pipeline (classify->residual->CPI->reconcile) merged into v2 computed
    top_residual_computed: 'computed', // same merge
    cpi_capacity_applied: 'computed', // same merge
    reconciled: 'computed', // numbers reconciled, awaiting sign-off = v2 computed (buyer review, 21d timer re-arms)
    signed_off: 'agreed', // non-terminal; sign-off = mutual agreement, settlement instruction still due
    invoiced: 'settled_instructed', // invoice raised = settlement instructed; rails are downstream (record-only chain)
  },
  ppa_change_in_law: {
    event_logged: 'notified',
    eligibility_review: 'assessing',
    impact_assessment: 'assessing',
    claim_submitted: 'assessing',
    counterparty_review: 'assessing',
    negotiation: 'assessing',
    in_arbitration: 'disputed',
    relief_granted: 'agreed',
  },
  ppa_nomination: {
    deviation_settled: 'accepted',
    excused: 'accepted',
    cancelled: 'withdrawn',
    nomination_window_open: 'submitted', // v2 has no pre-submission window; earliest state, grid 4h timer re-arms
    da_nominated: 'submitted', // nominated, awaiting grid validation
    da_confirmed: 'validated',
    id_revised: 'submitted', // v2 revise loops back to submitted for re-validation
    delivery_in_progress: 'accepted', // v2 nomination ends at acceptance; delivery is downstream — lossy, payload keeps status
    delivery_complete: 'accepted', // same collapse
    reconciled: 'accepted', // post-delivery reconciliation not modelled in v2
    dispute_raised: 'accepted', // v2 has no dispute state; reconciliation dispute is downstream of the accepted nomination
  },
  ppa_termination: {
    closed: 'terminated',
    reinstated: 'withdrawn',
    termination_triggered: 'notified', // v2 opens at notice served; trigger precedes it — earliest state
    notice_served: 'notified',
    termination_review: 'cure_period', // post-cure review; last v2 non-terminal before the terminate/withdraw decision
    termination_confirmed: 'terminated',
    eta_assessment: 'terminated', // buy-out (ETA) computation is post-termination; v2 moves no money (record-only)
    eta_agreed: 'terminated', // same collapse
    disputed: 'terminated', // ETA dispute — PPA already confirmed terminated; v2 has no dispute state
    settlement_pending: 'terminated', // payment is a downstream settlement chain's concern
  },
  project_change_order: {
    incorporated: 'approved',
    cancelled: 'withdrawn',
    draft: 'raised',
    submitted: 'raised', // v2 raise = submit; pre-assessment
    screening: 'raised', // screening precedes impact assessment; v2 assessed means assessment complete
    impact_assessment: 'raised', // assessment underway, not done; originator 24h timer re-arms
    deferred: 'raised', // parked pending resubmit; v2 has no parked state
    disputed: 'pending_approval', // v1 dispute arises at approval and resolves back to re-assessment; approver holds
  },
  project_risk: {
    cancelled: 'withdrawn',
  },
  public_consultation: {
    closed: 'outcome_published',
  },
  rec_lifecycle: {
    rejected: 'cancelled',
    clawed_back: 'cancelled',
    issuance_requested: 'active', // v2 has no pre-issuance states; certificate enters as active — lossy, payload keeps status
    eligibility_review: 'active', // same collapse
    issued: 'active',
    listed_for_transfer: 'active', // listing not modelled; still holder-held
    allocated: 'reserved', // allocated to a consumption claim pending retirement = v2 reserved-for-retirement (30d timer)
    disputed: 'transferred', // integrity dispute freezes a post-transfer cert; v2 has no dispute state, transferred is untimed
  },
  reserve_account: {
    breached: 'shortfall', // non-terminal — arms cure SLA
    cancelled: 'withdrawn',
    reserve_required: 'establishment_requested',
    funding_scheduled: 'funding', // v2 merged schedule + in-progress into one awaiting-funding state
    funding_in_progress: 'funding',
    shortfall_flagged: 'shortfall',
    cure_pending: 'shortfall', // cure underway; v2 shortfall (borrower, 5d) is the cure window
    drawn: 'shortfall', // authorised draw leaves balance below target pending replenish; nearest v2 analogue
    release_requested: 'funded', // release pending; v2 released is terminal, so hold at funded (agent holds)
  },
  reserve_activation: {
    settled: 'settlement_instructed',
    dispute_resolved: 'settlement_instructed',
    withdrawn: 'cancelled',
    activation_issued: 'instructed',
    ramping: 'dispatched', // v2 dispatched label is 'ramping to output'
    sustaining: 'dispatched', // v2 merged ramp + sustain into dispatched
    released: 'delivered', // activation ended, delivery report/review due; grid 2d timer re-arms
    performance_review: 'delivered', // SO reviewing delivered performance = v2 delivery-reported-awaiting-verification
    verified: 'delivery_verified', // non-terminal; settlement instruction still due
    non_performance: 'non_delivery',
    disputed: 'delivery_verified', // v2 has no dispute state; hold at last pre-settlement review state
  },
  service_contract: {
    renewed: 'active', // non-terminal — live contract
    cancelled: 'terminated',
    quoted: 'under_review', // quote issued, customer considering (72h timer re-arms)
    renewal_due: 'active', // renewal sub-process not modelled in v2; contract remains active
    negotiating: 'active', // renewal negotiation on a live contract — mapping to under_review would un-execute it
    in_grace: 'active', // grace period keeps service running; v2 has no grace state, expiry is a manual transition
  },
  service_request: {
    archived: 'closed',
    approved: 'assigned', // v2 merged approve->assign; approval granted, agent queue (8h timer re-arms)
    user_responded: 'fulfilment_in_progress', // user reply puts the ball back with the agent, matching v2 awaiting_user exit
  },
  settlement_fail: {
    closed_resolved: 'resolved',
    written_off: 'cancelled',
    instruction_pending: 'detected', // pre-fail instruction pending; earliest v2 state (clearing 1d timer)
    fail_recorded: 'detected',
    extension_granted: 'investigating', // extension runs inside the investigation/cure window
    penalty_accruing: 'investigating', // v2 has no penalty state; fail still unresolved, payload keeps accrual status
    buy_in_initiated: 'buy_in_instructed',
    buy_in_executing: 'buy_in_instructed', // execution happens on the rails; v2 records instruction only
    buy_in_settled: 'resolved',
    cash_compensation: 'resolved', // compensation instructed = fail resolved; cash movement is downstream (record-only)
  },
  sll_kpi: {
    sustainability_event: 'breach_recorded', // non-terminal
  },
  sseg_registration: {
    referred_to_licensing: 'technical_review', // non-terminal
    refused: 'rejected',
    lapsed: 'withdrawn',
    registration_received: 'submitted',
    eligibility_screening: 'under_review', // non-terminal; re-arms 10d review SLA
    information_requested: 'under_review', // non-terminal; v2 has no info-gap loop — collapses into the review it rejoins; applicant-held gap survives in payload.row
    technical_verification: 'technical_review', // non-terminal
    exemption_determination: 'technical_review', // non-terminal; v2 has no committee-determination state between technical review and approval — still regulator-held pre-decision
  },
  submittal_rfi: {
    closed_clean: 'closed',
    drafted: 'submitted', // v2 has no draft state; entry
    distributed: 'submitted', // non-terminal; v1 distributed = with reviewer awaiting review start, exactly v2 submitted (holder reviewer, 2d)
    clarification_requested: 'revision_requested', // non-terminal; ball with originator in both
    responded: 'answered', // non-terminal; arms 3d close timer
    approved: 'answered', // non-terminal; post-decision pre-closeout; approval survives in payload.row
    returned_for_revision: 'revision_requested', // non-terminal; direct match
    distributed_for_construction: 'closed', // v2 collapses IFC/incorporate/close into terminal closed
  },
  tariff_determination: {
    implemented: 'determined',
    remitted: 'analysis', // non-terminal — remittal reopens analysis
    application_received: 'filed',
    completeness_review: 'filed', // non-terminal; v2 filed (regulator, 30d) covers intake + completeness screening
    public_consultation: 'public_process', // non-terminal; rename
    revenue_analysis: 'analysis', // non-terminal
    determination_issued: 'determined', // v2 collapses issue/implement into terminal determined
    reconsideration_requested: 'analysis', // non-terminal; v2 has no reconsideration state — regulator re-analysing, re-arms 45d; v1 status in payload.row
  },
  trade_allocation: {
    settled: 'confirmed',
    executed: 'proposed', // entry; executing broker to propose allocation
    allocation_pending: 'proposed', // non-terminal; allocation still with executing broker
    give_up_pending: 'allocated', // non-terminal; counterparty (clearing broker) to accept = v2 allocated holder
    give_up_accepted: 'allocated', // non-terminal; accepted but pre-confirmation
    confirmation_issued: 'allocated', // non-terminal; awaiting counterparty affirmation
    affirmed: 'confirmed', // terminal; v1 matched/settled tail is beyond v2 scope
    break_review: 'allocated', // non-terminal; v1 break rejoins confirmation_issued — back in counterparty court; break survives in payload.row
  },
  transmission_outage: {
    extended: 'outage_in_progress',
  },
  vcm_project_development: {
    credits_issued: 'registered',
    cancelled: 'withdrawn',
  },
  vendor_escalation: {
    // no disputed state in v2; remediation_in_progress has no SLA so no timer arms
    recall_issued: 'remediation_in_progress',
    arbitration: 'remediation_in_progress',
    filed: 'raised',
    vendor_triage: 'acknowledged', // non-terminal; vendor engaged, triaging
    vendor_decision: 'acknowledged', // non-terminal; vendor position recorded, pre-plan; decision in payload.row
    escalated_to_oem: 'acknowledged', // non-terminal; v2 has no OEM tier — still vendor-side assessment; OEM stage in payload.row
    oem_field_investigation: 'acknowledged', // non-terminal; investigation = assessment phase
    oem_decision: 'remediation_planned', // non-terminal; v1 oem_decision recorded → next step is remediation, same position as plan-in-hand
    remediation: 'remediation_in_progress', // non-terminal; work underway
  },
  virtual_ppa_settlement: {
    settled: 'settled_instructed',
    written_off: 'cancelled',
  },
  warranty_claim: {
    closed: 'claim_closed',
    opened: 'claim_submitted', // v2 has no internal draft/triage stage; entry
    triaged: 'claim_submitted', // non-terminal; still pre-vendor in v1 — collapses to entry; v1 status in payload.row
    submitted: 'claim_submitted', // non-terminal; direct match (holder vendor, 5d)
    acknowledged: 'under_assessment', // non-terminal; vendor engaged
    under_review: 'under_assessment', // non-terminal; rename
    disputed: 'under_assessment', // non-terminal; v2 has no dispute state — v1 dispute can resolve back to approved, so back in assessment; re-arms 10d
    fulfilled: 'remediation_complete', // non-terminal; v1 fulfilled → close remains — v2 remediation_complete (claimant verifies then closes, 5d) is the same position
  },
  warranty_recovery: {
    rejected: 'recovery_denied',
    written_off: 'withdrawn',
    claim_drafted: 'recovery_filed', // v2 has no draft state; entry
    submitted_to_oem: 'recovery_filed', // non-terminal; filed with OEM awaiting acknowledgement (holder vendor, 72h)
    oem_acknowledged: 'under_assessment', // non-terminal; OEM engaged, assessing
    assessment_complete: 'under_assessment', // non-terminal; assessment done but approve/deny decision pending — v2 has no interstitial pre-decision state; v1 status in payload.row
    approved: 'recovery_approved', // non-terminal; awaiting recovery, arms 72h
    disputed: 'under_assessment', // non-terminal; v2 has no dispute state — v1 dispute resolves back to approved, so back in assessment
    recovery_pending: 'recovery_approved', // non-terminal; approved with payment pending = v2 recovery_approved (vendor to pay, 72h)
  },
  wheeling_access: {
    // post-grant v1 statuses land on the terminal grant — v1 status in payload.row
    terminated: 'access_granted',
    expired: 'access_granted',
  },
  algo_certification: {
    registration_submitted: 'submitted', // intake maps to earliest v2 state
    documentation_review: 'under_review', // regulator doc review = under_review
    conformance_testing: 'testing', // same phase, v2 name 'testing'
    risk_controls_validation: 'testing', // risk-control validation is part of the conformance-testing phase
    certification_review: 'under_review', // final regulator review before certify
    recertification_review: 'under_review', // re-cert review re-enters regulator review
    deployed: 'certified', // live/deployed algo = certified (non-terminal in v2)
    remediation_required: 'suspended', // non-terminal remediation window; v2 suspended is regulator-held 30d
    decommissioned: 'withdrawn', // voluntary end-of-life; revoked is regulator-stripped, so withdrawn is nearer
  },
  capital_adequacy_report: {
    data_gathering: 'draft', // all pre-submission prep collapses to entity-held draft
    rwa_calculation: 'draft', // pre-submission
    capital_aggregation: 'draft', // pre-submission
    icaap_review: 'draft', // internal review, still pre-SARB
    board_review: 'draft', // internal governance, still pre-SARB
    submitted_sarb: 'submitted', // filed with regulator
    queries_raised: 'deficient', // regulator returned queries; v2 deficient is entity-held response state
    queries_responded: 'under_review', // responses back with regulator
    remediation_required: 'deficient', // returned deficient, entity must act
    remediation: 'remediating', // same phase, v2 name
    capital_breach: 'lapsed', // v1 adverse terminal; lapsed is the only non-accepted, non-voluntary v2 terminal (v1 status survives in payload.row)
  },
  carbon_scope3_disclosure: {
    limited_assurance_complete: 'assurance_complete', // v2 collapses assurance grades into one complete state
    reasonable_assurance_complete: 'assurance_complete', // grade preserved in payload.row
  },
  carbon_tax_return: {
    period_open: 'draft', // all pre-submission prep collapses to taxpayer-held draft
    data_collection: 'draft', // pre-submission
    emissions_calc: 'draft', // pre-submission
    allowances_applied: 'draft', // pre-submission
    return_prepared: 'draft', // pre-submission
    internal_approved: 'draft', // approved internally but not yet filed
    acknowledged: 'submitted', // SARS acknowledged receipt; still regulator-held
    under_sars_review: 'submitted', // v2 'submitted' covers the with-SARS review window
    assessment_issued: 'assessed', // same phase, v2 name
    payment_made: 'finalized', // v1 happy terminal -> v2 happy terminal (v2 'paid' is non-terminal)
    disputed: 'rejected', // v1 adverse terminal -> nearest adverse v2 terminal
  },
  change_request: {
    change_requested: 'submitted', // intake maps to earliest v2 state
    assessment: 'assessing', // same phase, v2 name
    cab_review: 'assessing', // CAB review is the tail of the assessing phase before 'approved'
    implemented: 'review', // implemented awaiting PIR = post-implementation review
    pir: 'review', // same phase, v2 name
    cancelled: 'withdrawn', // v1 terminal cancel -> v2 withdrawn (no cancelled state)
  },
  cod_chain: {
    draft: 'cod_declared', // v2 starts at COD readiness declaration; construction stages collapse to start
    epc_signed: 'cod_declared', // pre-commissioning construction
    ntp_issued: 'cod_declared', // pre-commissioning construction
    mobilization: 'cod_declared', // pre-commissioning construction
    mechanical_complete: 'cod_declared', // pre-commissioning construction (v1 status in payload.row)
    cold_commissioning: 'commissioning_review', // commissioning phase
    cold_commissioned: 'commissioning_review', // same phase, past-tense v1 spelling (both spellings exist in the data)
    grid_synchronized: 'commissioning_review', // commissioning phase, pre reliability run
    cancelled: 'withdrawn', // v1 terminal cancel -> v2 withdrawn (cod_rejected is certifier refusal)
  },
  control_environment_audit: {
    control_defined: 'planned', // design/scoping phase = planning
    design_documented: 'planned', // design phase
    walkthrough_completed: 'planned', // design walkthrough still precedes test execution
    tod_test_planned: 'fieldwork', // TOD/TOOE testing lanes are the audit fieldwork phase
    tod_evidence_collected: 'fieldwork', // testing phase
    tod_test_executed: 'fieldwork', // testing phase
    tooe_test_planned: 'fieldwork', // testing phase
    tooe_evidence_collected: 'fieldwork', // testing phase
    tooe_test_executed: 'fieldwork', // testing phase
    deficiency_assessed: 'findings_issued', // assessed deficiency = findings issued to auditee
    remediation_completed: 'verified', // auditee done; v2 verified is auditor-held confirm-then-close (24h)
    excepted: 'verified', // exception accepted, no remediation needed, heading to close
    suspended: 'remediation', // paused mid assessment/remediation cycle; nearest non-terminal by position
    remediated_re_test: 'verified', // re-test is the auditor verifying remediation
    archived: 'audit_closed', // v1 happy terminal
    deficient: 'audit_closed', // closed-with-deficiency is still a completed audit, not a cancel (v1 status in payload.row)
  },
  credit_facility_application: {
    application_received: 'submitted', // intake
    screening: 'submitted', // pre-assessment intake check, lender-held
    credit_assessment: 'under_assessment', // same phase, v2 name
    committee_review: 'under_assessment', // committee is part of the assessment phase pre-approval
    referred_back: 'under_assessment', // referred back = more assessment
    conditions_pending: 'credit_approved', // approved-with-conditions = committee approval granted
    approved: 'credit_approved', // same phase, v2 name
    agreement_issued: 'facility_offered', // agreement/offer out to applicant
    cp_satisfied: 'facility_accepted', // CPs done, lender-held pre-activation
    facility_available: 'originated', // v1 happy terminal -> v2 record-only origination terminal
  },
  crediting_period_renewal: {
    renewal_due: 'renewal_requested', // earliest v2 state
    application_submitted: 'renewal_requested', // intake
    completeness_check: 'renewal_requested', // intake completeness check, validator-held
    revision_requested: 'renewal_requested', // proponent revising = back at request stage
    baseline_reassessment: 'under_reassessment', // reassessment phase
    additionality_retest: 'under_reassessment', // reassessment phase
    vvb_validation: 'under_reassessment', // VVB work is the reassessment phase
    standard_review: 'validated', // standard-body review follows VVB validation; v2 validated is registry-held
    refused: 'rejected', // v1 adverse terminal -> v2 name
  },
  demand_response_event: {
    registered: 'called', // earliest v2 state; enrolment collapses to event start
    notification_sent: 'called', // v2 'called' is the notification step
    performance_metering: 'load_shed', // metering window post-shed, pre-verification (grid-held)
    settlement_calc: 'performance_verified', // verified, computing compensation; v2 has no settlement stage before instruction
    settlement_agreed: 'performance_verified', // non-terminal pre-instruction (v1 status in payload.row)
    settlement_disputed: 'performance_verified', // measurement dispute keeps it non-terminal at verification
    settled: 'compensated_instructed', // v1 happy terminal -> v2 record-only compensation terminal
  },
  disbursement_case: {
    tranche_released: 'paid', // v1 chain opens post-release (UoP monitoring); funds out, receipt/UoP not yet confirmed
    invoices_pending: 'paid', // borrower assembling UoP invoices post-payment; v2 has no post-payment verification stages
    invoices_submitted: 'paid', // UoP invoices in, lender validating; collapses into paid, v1 status in payload.row
    bank_validating: 'paid', // bank-statement validation is UoP evidence work under paid
    ie_certifying: 'paid', // IE certification of UoP still pre-confirmation
    uop_certified: 'paid', // certified but not reconciled; only non-terminal post-payment v2 state
    reconciled: 'confirmed', // clean UoP reconciliation = receipt confirmed, matching clean terminal
    clawback_executed: 'cancelled', // funds clawed back; adverse close of the disbursement
    waived: 'confirmed', // reconciliation requirement waived, case closed benignly; waiver survives in payload.row
  },
  fsca_compliance_report: {
    report_scheduled: 'drafted', // earliest pre-submission stage collapses to entity-held draft
    data_gathering: 'drafted', // pre-submission prep; v1 status in payload.row
    drafting: 'drafted', // same lifecycle position
    internal_review: 'drafted', // internal QA still pre-submission
    co_sign_off: 'drafted', // compliance-officer sign-off is the last pre-submission step
    queries_received: 'under_review', // regulator query round is part of the review cycle; v1 status in payload.row
    queries_responded: 'under_review', // response back with regulator, review continues
    filed: 'compliant', // successful filing = clean terminal
    deficiency_found: 'non_compliant', // exact semantic match: deficiency puts entity in non-compliant remediation path
    refiled: 'compliant', // refiled after remediation = accepted close; v1 status in payload.row
    revocation_risk: 'rejected', // adverse terminal (licence-revocation exposure)
  },
  gca_connection: {
    application_filed: 'application_submitted', // same event, renamed
    studies_required: 'under_review', // operator scoping studies is part of application review
    studies_executing: 'under_review', // studies in flight; v1 status in payload.row
    cost_estimate_issued: 'offer_issued', // cost estimate is the v1 connection offer
    cost_accepted: 'offer_accepted', // applicant accepted the estimate
    connection_agreement_drafted: 'offer_accepted', // UNGCA drafting post-acceptance, pre-execution; v1 status in payload.row
    executed: 'agreement_executed', // same event, renamed
    construction: 'agreement_executed', // build phase under the executed agreement; non-terminal, v1 status in payload.row
    energised: 'agreement_executed', // energised but not yet in commercial service; non-terminal preferred, v1 status in payload.row
    in_service: 'connected', // clean terminal: connected and energized
    rejected: 'application_rejected', // adverse terminal, renamed
  },
  green_bond_report: {
    impact_calculation: 'impact_calculated', // same stage, tense rename
    queries_responded: 'under_review', // response lands back with JSE, review continues; v1 status in payload.row
    deficiency_noted: 'queries_raised', // issuer-held defect-fixing stage; nearest issuer-held review state
    remediation: 'queries_raised', // issuer remediating deficiency pre-resubmission; v1 status in payload.row
  },
  imbalance_settlement: {
    period_open: 'raised', // settlement case opened, pre-computation
    meter_data_received: 'raised', // data intake still pre-calculation; v1 status in payload.row
    nominations_reconciled: 'raised', // reconciliation is calc input prep
    imbalance_computed: 'calculated', // computation done, pricing pending collapses here
    priced: 'calculated', // priced but statement not yet out; v1 status in payload.row
    invoice_issued: 'statement_published', // invoice = the published settlement statement
    invoice_acknowledged: 'statement_published', // counterparty-held post-publication window
    dispute_window_open: 'statement_published', // window runs while statement stands
    payment_pending: 'statement_published', // v2 has no payment state (settlement-honesty); v1 status in payload.row
    settled: 'settlement_confirmed', // clean terminal, renamed
    archived: 'settlement_confirmed', // archived post-settlement; terminal close, v1 status in payload.row
    resolved_dispute: 'dispute_resolved', // same stage, word-order rename
    invoice_revised: 'statement_published', // revised statement republished to counterparty; v1 status in payload.row
    aged_arrears: 'statement_published', // unpaid but live collections (non-terminal in v1; written_off is the bad-debt terminal)
  },
  ipp_aud: {
    audit_cycle_opened: 'planned', // cycle opened = audit planned
    trial_balance_preparation: 'planned', // auditee prep pre-fieldwork; v1 status in payload.row
    year_end_journals: 'planned', // still pre-fieldwork accounting prep
    audit_fieldwork: 'fieldwork', // same stage, renamed
    management_accounts_review: 'fieldwork', // review is part of fieldwork evidence phase; v1 status in payload.row
    audit_queries_resolution: 'findings_issued', // auditee resolving auditor queries = findings on auditee's desk
    draft_opinion_review: 'verified', // post-fieldwork, pre-close auditor-held stage; v1 status in payload.row
    board_approval: 'verified', // approval pending before close; v1 status in payload.row
    cipc_submission: 'verified', // statutory filing step pre-close; lossy, v1 status in payload.row
    audit_completed: 'audit_closed', // clean terminal
    audit_qualified: 'audit_closed', // qualified opinion still ends the audit; qualification survives in payload.row
    audit_lapsed: 'audit_cancelled', // lapsed cycle = cancelled terminal
  },
  ipp_doc_control: {
    draft_uploaded: 'document_submitted', // upload = submission into document control
    metadata_indexed: 'document_submitted', // indexing is intake processing; v1 status in payload.row
    revision_open: 'document_submitted', // new revision re-enters at submission
    IDC_assigned: 'under_review', // IDC assignment starts the review
    transmitted: 'under_review', // transmitted to reviewers; v1 status in payload.row
    reviewed: 'under_review', // review outcome not yet dispositioned
    commented: 'revision_required', // comments back to originator = revision required
    revised: 'under_review', // revised document resubmitted for review
    as_built_finalised: 'approved', // post-review, pre-archive; non-terminal preferred over terminal IFC, v1 status in payload.row
    archived: 'issued_for_construction', // clean lifecycle-complete terminal; lossy, v1 status in payload.row
    hold: 'under_review', // hold = paused review (isda_agreement on_hold precedent); v1 status in payload.row
  },
  ipp_fm: {
    fm_event_occurred: 'notified', // v2 chain opens at notification; earliest state, v1 status in payload.row
    fm_notice_issued: 'notified', // same event, renamed
    fm_notice_verified: 'under_assessment', // verified notice moves claim into counterparty assessment
    fm_relief_in_progress: 'assessed', // relief determined and running; non-terminal preferred over terminal relief_granted
    fm_monitoring: 'assessed', // ongoing-event monitoring under an assessed claim; v1 status in payload.row
    fm_disputed: 'under_assessment', // dispute reopens assessment; v1 status in payload.row
    fm_arbitration: 'under_assessment', // v2 has no arbitration state; live contested claim, v1 status in payload.row
    fm_resolved: 'relief_granted', // resolved FM = relief cycle concluded; clean terminal, v1 status in payload.row
    fm_arbitration_determined: 'relief_granted', // determination outcome not derivable from status alone; v1 status in payload.row
    fm_prolonged_termination: 'relief_denied', // prolonged-FM termination is the adverse terminal; v1 status in payload.row
  },
  kyc_verification: {
    pending_submission: 'kyc_initiated', // case opened, documents awaited
    documents_submitted: 'screening_pending', // docs in, screening is the next step
    documents_incomplete: 'kyc_initiated', // back to document gathering; v1 status in payload.row
    documents_received: 'screening_pending', // confirmed receipt, screening queued
    automated_screening: 'screening_pending', // screening in flight; v1 status in payload.row
    enhanced_due_diligence: 'edd_in_progress', // same stage, renamed
    compliance_review: 'decision_pending', // compliance officer deciding
    conditionally_approved: 'decision_pending', // conditions outstanding pre-final admit; non-terminal, v1 status in payload.row
    verified: 'admitted', // clean terminal, renamed
    rejected: 'declined', // adverse terminal, renamed
    suspended: 'decision_pending', // v2 has no suspended state; live case back with compliance, v1 status in payload.row
    lapsed: 'withdrawn', // timed out without decision; neutral terminal, v1 status in payload.row
  },
  market_abuse_case: {
    alert_raised: 'flagged', // surveillance alert = flag
    triaged: 'triage', // same stage, renamed
    under_investigation: 'investigating', // same stage, renamed
    evidence_review: 'investigating', // evidence work is part of the investigation; v1 status in payload.row
    analysis_complete: 'investigating', // outcome (clear vs substantiate) not derivable from status alone; v1 status in payload.row
    cleared: 'unfounded', // cleared after analysis = unfounded terminal
    stor_filed: 'substantiated', // STOR filing implies a suspicious finding; non-terminal
    regulator_referred: 'substantiated', // non-terminal in v1 (case continues); v2 enforcement_referred is terminal, so prefer non-terminal, v1 status in payload.row
    enforcement_action: 'substantiated', // live enforcement stage; non-terminal preferred, v1 status in payload.row
    sanctioned: 'closed', // enforcement concluded with sanction; v1 status in payload.row
    disputed: 'substantiated', // post-finding dispute, case live; v1 status in payload.row
    dispute_resolved: 'closed', // dispute concluded, case closed
  },
  milestone_variance_report: {
    remediation_accepted: 'dfi_accepted', // DFI accepted the remediation = clean close; v1 status in payload.row
  },
  mrv_submissions: {
    doe_assigned: 'under_verification', // DOE assigned = verification underway
    doe_review: 'under_verification', // DOE reviewing the monitoring report
    doe_opinion_positive: 'verified', // positive opinion = verification passed
    doe_opinion_qualified: 'verified', // qualified-but-positive opinion still passes; v1 status in payload.row
    cra_review: 'verified', // post-verification CRA step; nearest non-terminal post-verify state
    cra_approved: 'verified', // CRA approved, awaiting issuance; pre-publish
    issuance_authorized: 'verified', // authorized but not yet issued; non-terminal
    doe_opinion_adverse: 'rejected', // adverse opinion = verification failed, terminal
    doe_opinion_disclaimer: 'rejected', // disclaimer opinion = no assurance, terminal
    cra_rejected: 'rejected', // CRA refused, terminal
    issued: 'published', // credits issued = report published, terminal
  },
  om_work_order: {
    created: 'new', // same intake state, renamed
    diagnosing: 'diagnose', // gerund -> imperative rename
    repairing: 'repair', // gerund -> imperative rename
    testing: 'test', // gerund -> imperative rename
  },
  ppa_payment_security: {
    security_required: 'security_requested', // same opening state, renamed
    instrument_submitted: 'instrument_issued', // instrument lodged = issued into the case
    under_verification: 'instrument_issued', // seller verifying the lodged instrument; pre-in_force
    active: 'in_force', // live credit support
    adequacy_review: 'in_force', // periodic review of a live instrument; non-terminal
    drawdown_initiated: 'call_pending', // draw on the security = call in flight
    replenishment_pending: 'call_pending', // post-draw top-up still inside the call workflow; non-terminal
    expiry_pending: 'in_force', // nearing expiry but still live; v2 expired is terminal, prefer non-terminal
    substitution_pending: 'in_force', // live instrument being substituted; non-terminal
    forfeited: 'called', // security drawn/forfeited = call executed, terminal
    rejected: 'request_rejected', // instrument refused, terminal
  },
  ppa_take_or_pay: {
    accrual_open: 'period_open', // contract-year accrual running
    year_end: 'volume_measured', // year closed, contracted-vs-delivered measurement stage
    statement_issued: 'shortfall_computed', // statement quantifies the shortfall
    evidence_required: 'shortfall_computed', // evidence step is part of shortfall assessment; non-terminal
    evidence_submitted: 'shortfall_computed', // still assessing; v1 status in payload.row
    quantum_proposed: 'shortfall_computed', // quantum proposed off the computed shortfall, pre-agreement
    quantum_agreed: 'shortfall_computed', // agreed but not yet invoiced; v2 invoiced_instructed is terminal, prefer non-terminal
    settled: 'invoiced_instructed', // settlement-honesty: instruction only, no custody; terminal
    waived: 'met_closed', // claim waived = closed with no ToP liability, terminal
  },
  problem_record: {
    categorized: 'problem_logged', // categorization is intake, pre-investigation
    investigating: 'under_investigation', // same stage, renamed
    rca_identified: 'root_cause_identified', // same stage, renamed
    fix_proposed: 'known_error', // known error logged with proposed fix; pre-resolution
    change_raised: 'known_error', // change in flight, not yet resolved; v1 status in payload.row
    fix_deployed: 'resolved', // fix live, pending verification
    resolution_verified: 'resolved', // verified resolution awaiting closure; non-terminal
    escalated: 'closed', // v1 terminal hand-off; closed at this desk, v1 status in payload.row
    cancelled: 'withdrawn', // cancelled record = withdrawn, terminal
  },
  procurement_rfp: {
    draft: 'requisition_raised', // RFP being drafted = requisition stage
    published: 'rfq_issued', // RFP published to market = RFQ out
    bidding: 'rfq_issued', // bids open against the issued RFQ; non-terminal
    bid_opened: 'bids_evaluating', // public bid opening — bids are in, evaluation starting
    bid_closed: 'bids_evaluating', // bids in, evaluation starting
    evaluation: 'bids_evaluating', // same stage, renamed
    shortlisted: 'bids_evaluating', // shortlist is part of evaluation; v1 status in payload.row
    disputed: 'bids_evaluating', // bid dispute holds the award decision; nearest non-terminal
    contracted: 'po_issued', // contract signed = PO issued
  },
  rez_capacity: {
    completeness_screening: 'application_received', // intake screening, pre-study
    information_requested: 'application_received', // applicant supplying info, still pre-study
    capacity_assessment: 'study_in_progress', // grid study underway
    queue_positioned: 'study_in_progress', // queued awaiting offer; v2 has no queue state, pre-offer
    offer_issued: 'allocation_offered', // same stage, renamed
    capacity_reserved: 'allocation_accepted', // offer accepted, capacity reserved pending milestones
    capacity_allocated: 'allocation_active', // allocation in force, terminal
    rejected: 'application_rejected', // application refused, terminal
    lapsed: 'offer_declined', // offer lapsed unaccepted = declined by inaction, terminal
    relinquished: 'withdrawn', // applicant gave capacity back = withdrew, terminal
  },
  slb_kpi_ratchet: {
    kpi_missed: 'ratchet_applied', // missed KPI triggers the step-up ratchet; nearest terminal outcome
  },
  support_tickets: {
    open: 'reported', // same opening state, renamed
    awaiting_user: 'awaiting_reporter', // same pause state, renamed
  },
  trade_report: {
    report_due: 'reporting_pending', // obligation open, report not yet made
    report_generated: 'reporting_pending', // generated but not yet submitted to the TR
    submitted_to_tr: 'submitted', // lodged at the trade repository
    tr_acknowledged: 'acknowledged', // TR ack is v2's completion state; v2 has no post-ack recon, v1 status in payload.row
    reconciled: 'acknowledged', // recon complete post-ack; v2 ack is the done state
    break_identified: 'rejected', // recon break needs correction; v2 rejected is the non-terminal fix-and-resubmit state
    break_resolved: 'acknowledged', // break cleared, report stands acknowledged
    corrected: 'submitted', // corrected report resubmitted, awaiting ack
    tr_rejected: 'rejected', // TR refused the submission; non-terminal pending correction
    confirmed_complete: 'acknowledged', // confirmed done = acknowledged, terminal
    exempted: 'withdrawn', // reporting obligation exempted = deliberately withdrawn, terminal
    cancelled: 'withdrawn', // cancelled report = withdrawn, terminal
  },
};

export type LegacyRow = Record<string, Json | undefined>;

export interface ImportDeps {
  store: Store;
  clock: Clock;
  ids: IdSource;
  chains: Record<string, ChainDecl>;
}

export interface ImportReport {
  chain_key: string;
  imported: number;
  skipped_existing: number;
  quarantined: Array<{ id: string; status: string }>;
  dry_run: boolean;
}

/** Resolve the static v1 descriptor for an importable chain. Throws on any key
 *  outside the allow-list — the ONLY source of table/column identifiers. */
export function legacyDescriptor(chain_key: string): ChainDescriptor {
  if (!(chain_key in IMPORTABLE_CHAINS)) throw new Error(`chain '${chain_key}' is not importable`);
  const d = MERIDIAN_CHAINS.find((x) => x.key === chain_key);
  if (!d) throw new Error(`no MERIDIAN_CHAINS descriptor for '${chain_key}'`);
  return d;
}

export const importIdempotencyKey = (chain_key: string, rowId: string): string =>
  `import:${chain_key}:${rowId}`;

/** v1 timestamps are SQLite CURRENT_TIMESTAMP-ish ('YYYY-MM-DD HH:MM:SS', UTC,
 *  no zone marker) or already RFC3339. Normalise to RFC3339 UTC or give up. */
function isoOrNull(v: Json | undefined): string | null {
  if (typeof v !== 'string' || !v) return null;
  const s = v.includes('T') ? v : v.replace(' ', 'T');
  const withZone = /[zZ]$|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// ponytail: participant-id confidence = "is a UUID". Display names ("Standard
// Bank") skip party creation; widen to an oe_users lookup if backfill ever
// needs name→id resolution.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resumable v1 fetch: only rows not yet imported (idempotency key absent).
 *  Table name is a static literal from the descriptor; chain_key, afterId and
 *  limit bind to `?` placeholders.
 *
 *  `afterId` is the id-ordered cursor. Without it a full backfill can stall:
 *  a quarantined row never gets a v2_events row, so the NOT EXISTS clause
 *  re-selects it on every call — a chain whose lowest-id rows are all
 *  quarantinable would consume the whole window forever and never reach the
 *  importable tail. Callers page by passing the last id of the previous page. */
export async function fetchLegacyRows(
  db: D1Database,
  chain_key: string,
  limit: number,
  afterId = '',
): Promise<LegacyRow[]> {
  const desc = legacyDescriptor(chain_key);
  const res = await db
    .prepare(
      `SELECT t.* FROM ${desc.table} t
       WHERE t.id > ?
         AND NOT EXISTS (SELECT 1 FROM v2_events e WHERE e.idempotency_key = 'import:' || ? || ':' || t.id)
       ORDER BY t.id LIMIT ?`,
    )
    .bind(afterId, chain_key, Math.max(1, Math.min(limit, 500)))
    .all<LegacyRow>();
  return res.results ?? [];
}

/** Import pre-fetched v1 rows for one chain. Store-agnostic: the D1 SELECT
 *  lives in fetchLegacyRows / the route; tests feed rows straight in. */
export async function importChain(
  rows: LegacyRow[],
  chain_key: string,
  deps: ImportDeps,
  opts: { dry_run?: boolean } = {},
): Promise<ImportReport> {
  const counterpartyRole = IMPORTABLE_CHAINS[chain_key];
  const v2Key = RENAMED_IMPORTS[chain_key] ?? chain_key;
  const chain = deps.chains[v2Key];
  if (counterpartyRole === undefined || !chain) throw new Error(`chain '${chain_key}' is not importable`);
  const desc = legacyDescriptor(chain_key);
  const dry_run = opts.dry_run === true;
  const report: ImportReport = { chain_key, imported: 0, skipped_existing: 0, quarantined: [], dry_run };

  for (const row of rows) {
    const rowId = row.id == null ? '' : String(row.id);
    const rawStatus = typeof row[desc.statusCol] === 'string' ? (row[desc.statusCol] as string) : '';
    const status = chain.states[rawStatus] ? rawStatus : (STATUS_MAP[chain_key]?.[rawStatus] ?? rawStatus);
    const state = chain.states[status];
    if (!rowId || !state) {
      report.quarantined.push({ id: rowId, status: rawStatus });
      continue;
    }
    const idem = importIdempotencyKey(chain_key, rowId);
    if (await deps.store.findEventByIdempotencyKey(idem)) {
      report.skipped_existing++;
      continue;
    }

    const occurred_at = isoOrNull(row.updated_at) ?? isoOrNull(row.created_at) ?? isoUtc(deps.clock.now());
    const opened_at = isoOrNull(row.created_at) ?? occurred_at;

    // fields: v1 columns the v2 decl declares under the same name.
    const fields: Record<string, Json> = {};
    for (const [name, decl] of Object.entries(chain.fields)) {
      const v = row[name];
      if (v === null || v === undefined) continue;
      fields[name] = decl.type === 'boolean' && typeof v === 'number' ? v !== 0 : v;
    }

    const refVal = row[desc.refCol];
    const refBase = typeof refVal === 'string' && refVal ? refVal : rowId;

    // Everything below hangs off the txn id, and the id is not settled until we
    // know whether it collides (see the id-collision note at the commit loop),
    // so build the whole batch as a function of the candidate id.
    const buildBatch = async (txnId: string, refAttempt: number): Promise<CommitBatch> => {
      const event_id = deps.ids.uuid();
      const unhashed: Omit<EventRow, 'hash'> = {
        txn_id: txnId,
        seq: 1,
        event_id,
        chain_key: v2Key,
        type: `${v2Key}.imported`,
        from_state: null,
        to_state: status,
        actor_id: 'system:import',
        actor_kind: 'system:import',
        on_behalf_of: null,
        occurred_at,
        caused_by: null,
        reason_code: null,
        reason_text: null,
        payload: { provenance: 'legacy', row: row as Json },
        payload_version: 1,
        prev_hash: await genesisPrevHash(v2Key),
        idempotency_key: idem,
      };
      const event: EventRow = { ...unhashed, hash: await eventHash(unhashed) };

      // party: only where the counterparty column holds a confident participant id.
      const parties: PartyRow[] = [];
      const cp = desc.counterpartyCol ? row[desc.counterpartyCol] : null;
      if (counterpartyRole && typeof cp === 'string' && UUID_RE.test(cp)) {
        parties.push({
          txn_id: txnId,
          participant_id: cp,
          role_on_txn: counterpartyRole,
          terms: null,
          from_event_id: event_id,
          until_event_id: null,
        });
      }

      // timers: non-terminal rows arm the state's TimerDecls from occurred_at
      // (may be immediately due — correct SLA semantics for stale legacy rows).
      // Terminal rows arm nothing. Same shape the engine arms (engine.ts).
      const timers: TimerRow[] = [];
      if (!state.terminal) {
        const at = { epoch_ms: Date.parse(occurred_at), zone: 'UTC' as const };
        for (const t of chain.timers ?? []) {
          if (t.onState !== status) continue;
          timers.push({
            id: deps.ids.uuid(),
            txn_id: txnId,
            fire: t.fire,
            due_at: isoUtc(addDuration(at, t.after)),
            key: `${txnId}:${t.onState}:${t.fire}`,
            class: t.kind,
          });
        }
      }

      const txn: TxnRow = {
        id: txnId,
        chain_key: v2Key,
        human_ref: refAttempt === 1 ? refBase : `${refBase}~${refAttempt}`,
        title: chain.title(fields),
        state: status,
        seq: 1,
        visibility: chain.visibility,
        fields,
        opened_at,
        closed_at: state.terminal ? occurred_at : null,
      };

      return {
        insertEvent: event,
        insertTxn: txn,
        ...(parties.length ? { insertParties: parties } : {}),
        ...(timers.length ? { insertTimers: timers } : {}),
      };
    };

    if (dry_run) {
      report.imported++;
      continue;
    }

    // Commit under `rowId`, falling back to a chain-namespaced id. v2_txns.id
    // IS the v1 row id, but v1 ids are only unique per TABLE — oe_ipp_lc_reports
    // and the load-curtailment table both number their rows `lc_001`. The first
    // chain to import an id keeps it bare (so existing /v2/t/<id> links and the
    // legacy /thread redirect keep resolving); a later chain that collides takes
    // `<chain>:<id>` instead of being dropped. Only if BOTH are taken is the row
    // quarantined. Suffix-retry on human_ref is safe alongside this: both stores
    // validate every constraint before mutating, so a failed commit wrote nothing.
    let outcome: 'imported' | 'skipped' | 'collision' = 'collision';
    for (const txnId of [rowId, `${v2Key}:${rowId}`]) {
      for (let attempt = 1; ; attempt++) {
        try {
          await deps.store.commit(await buildBatch(txnId, attempt));
          outcome = 'imported';
          break;
        } catch (e) {
          if (e instanceof ConstraintViolation) {
            if (e.constraint === 'idempotency_key') {
              outcome = 'skipped'; // concurrent import raced us — same row landed
              break;
            }
            if (e.constraint === 'event_pk') {
              outcome = 'collision';
              break;
            }
            if (e.constraint === 'human_ref' && attempt < 6) continue;
          }
          throw e;
        }
      }
      if (outcome !== 'collision') break;
    }
    if (outcome === 'imported') report.imported++;
    else if (outcome === 'skipped') report.skipped_existing++;
    else report.quarantined.push({ id: rowId, status: rawStatus });
  }
  return report;
}
