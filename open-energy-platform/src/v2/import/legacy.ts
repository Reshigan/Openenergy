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
};

/** Written status-mapping decisions (CUTOVER_COVERAGE §1 header rule): v1
 *  statuses with no same-name v2 state map to the nearest v2 state by lifecycle
 *  position. The original v1 status survives verbatim in payload.row — the
 *  mapping only picks which v2 state the txn resumes in (and therefore which
 *  timers arm). Unmapped unknown statuses still quarantine. */
export const STATUS_MAP: Record<string, Record<string, string>> = {
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
 *  Table name is a static literal from the descriptor; chain_key and limit
 *  bind to `?` placeholders. */
export async function fetchLegacyRows(db: D1Database, chain_key: string, limit: number): Promise<LegacyRow[]> {
  const desc = legacyDescriptor(chain_key);
  const res = await db
    .prepare(
      `SELECT t.* FROM ${desc.table} t
       WHERE NOT EXISTS (SELECT 1 FROM v2_events e WHERE e.idempotency_key = 'import:' || ? || ':' || t.id)
       ORDER BY t.id LIMIT ?`,
    )
    .bind(chain_key, Math.max(1, Math.min(limit, 500)))
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
  const chain = deps.chains[chain_key];
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

    const event_id = deps.ids.uuid();
    const unhashed: Omit<EventRow, 'hash'> = {
      txn_id: rowId,
      seq: 1,
      event_id,
      chain_key,
      type: `${chain_key}.imported`,
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
      prev_hash: await genesisPrevHash(chain_key),
      idempotency_key: idem,
    };
    const event: EventRow = { ...unhashed, hash: await eventHash(unhashed) };

    // party: only where the counterparty column holds a confident participant id.
    const parties: PartyRow[] = [];
    const cp = desc.counterpartyCol ? row[desc.counterpartyCol] : null;
    if (counterpartyRole && typeof cp === 'string' && UUID_RE.test(cp)) {
      parties.push({
        txn_id: rowId,
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
          txn_id: rowId,
          fire: t.fire,
          due_at: isoUtc(addDuration(at, t.after)),
          key: `${rowId}:${t.onState}:${t.fire}`,
          class: t.kind,
        });
      }
    }

    const refVal = row[desc.refCol];
    const refBase = typeof refVal === 'string' && refVal ? refVal : rowId;
    const txn: TxnRow = {
      id: rowId,
      chain_key,
      human_ref: refBase,
      title: chain.title(fields),
      state: status,
      seq: 1,
      visibility: chain.visibility,
      fields,
      opened_at,
      closed_at: state.terminal ? occurred_at : null,
    };

    if (dry_run) {
      report.imported++;
      continue;
    }

    // Suffix-retry on human_ref collisions is safe: both stores validate ALL
    // constraints before mutating anything, so a failed commit wrote nothing.
    for (let attempt = 1; ; attempt++) {
      const batch: CommitBatch = {
        insertEvent: event,
        insertTxn: attempt === 1 ? txn : { ...txn, human_ref: `${refBase}~${attempt}` },
        ...(parties.length ? { insertParties: parties } : {}),
        ...(timers.length ? { insertTimers: timers } : {}),
      };
      try {
        await deps.store.commit(batch);
        report.imported++;
        break;
      } catch (e) {
        if (e instanceof ConstraintViolation) {
          if (e.constraint === 'idempotency_key' || e.constraint === 'event_pk') {
            report.skipped_existing++; // concurrent import raced us — same row landed
            break;
          }
          if (e.constraint === 'human_ref' && attempt < 6) continue;
        }
        throw e;
      }
    }
  }
  return report;
}
