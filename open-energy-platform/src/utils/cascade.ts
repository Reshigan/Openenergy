// ═══════════════════════════════════════════════════════════════════════════
// Cascade Event System — 35+ Event Types → Notifications + Webhooks + Audit
// ═══════════════════════════════════════════════════════════════════════════

import { regulatorInboxSpec, computeSlaDueAt } from './regulator-inbox-spec';
import { initialDunningCycle } from './lender-escalation-spec';

export type EventType =
  // Auth
  | 'auth.registered' | 'auth.login' | 'auth.logout' | 'auth.otp_sent' | 'auth.otp_verified'
  | 'auth.email_verified' | 'auth.password_reset' | 'auth.module_access_changed'
  // Contract
  | 'contract.created' | 'contract.phase_changed' | 'contract.signed' | 'contract.executed'
  | 'contract.amended' | 'contract.terminated' | 'contract.statutory_check_completed'
  // Trading
  | 'trade.order_placed' | 'trade.matched' | 'trade.settled' | 'trade.cancelled'
  // Escrow
  | 'escrow.created' | 'escrow.released' | 'escrow.refunded' | 'escrow.claimed'
  // Settlement
  | 'invoice.created' | 'invoice.issued' | 'invoice.viewed' | 'invoice.paid' | 'invoice.overdue' | 'invoice.disputed'
  | 'dispute.filed' | 'dispute.resolved'
  // Settlement-deep (T+1 cycles, default waterfall, bank instructions)
  | 'settlement.cycle_opened' | 'settlement.cycle_netted'
  | 'settlement.cycle_novated' | 'settlement.cycle_settled'
  | 'settlement.default_declared' | 'settlement.default_close_out'
  | 'settlement.default_recovered'
  | 'settlement.instruction_confirmed' | 'settlement.instruction_failed'
  // Carbon
  | 'carbon.traded' | 'carbon.retired' | 'carbon.transferring' | 'carbon.fund_nav_updated'
  | 'carbon.option_exercised' | 'carbon.option_expired'
  // IPP
  | 'ipp.project_created' | 'ipp.project_updated' | 'ipp.milestone_satisfied' | 'ipp.milestone_cp_satisfied'
  | 'ipp.financial_close' | 'ipp.disbursement_requested' | 'ipp.disbursement_approved'
  | 'ipp.performance_reported'
  // ESG
  | 'esg.score_calculated' | 'esg.report_published' | 'esg.decarbonisation_completed'
  | 'esg.transaction_recorded' | 'esg.transaction_restated'
  | 'esg.disclosure_created' | 'esg.disclosure_submitted'
  // Grid
  | 'grid.connection_created' | 'grid.constraint_active' | 'grid.wheeling_started'
  | 'grid.imbalance_calculated'
  // Ona
  | 'ona.fault_detected' | 'ona.fault_triaged' | 'ona.fault_resolved'
  | 'ona.forecast_synced' | 'ona.maintenance_scheduled' | 'ona.maintenance_updated'
  // Esums
  | 'om.site_created' | 'om.fault_detected' | 'om.fault_resolved'
  | 'om.work_order_created' | 'om.work_order_assigned' | 'om.work_order_acknowledged'
  | 'om.work_order_en_route' | 'om.work_order_on_site' | 'om.work_order_diagnosing'
  | 'om.work_order_repairing' | 'om.work_order_testing' | 'om.work_order_completed'
  | 'om.work_order_verified' | 'om.work_order_closed' | 'om.work_order_cancelled'
  | 'om.work_order_reopened'
  | 'esums.prediction_actioned' | 'esums.connection_registered'
  | 'esums.ingest_key_created' | 'esums.ingest_key_revoked'
  // Grid / Metering extras
  | 'grid.connection_commissioned' | 'metering.reading_validated'
  // Pipeline / Threads / Dealroom
  | 'pipeline.created' | 'pipeline.stage_changed' | 'pipeline.won' | 'pipeline.lost'
  | 'thread.posted' | 'dealroom.proposed' | 'dealroom.accepted'
  // Marketplace
  | 'marketplace.bid' | 'marketplace.listed' | 'marketplace.inquired' | 'marketplace.accepted'
  // General
  | 'demand.matched' | 'meter.ingested'
  | 'popia.consent_changed' | 'popia.data_exported' | 'popia.erasure'
  // Pipeline
  | 'pipeline.created' | 'pipeline.stage_changed' | 'pipeline.won' | 'pipeline.lost'
  // Threads / collaboration
  | 'thread.posted'
  | 'intelligence.item_created' | 'action_queue.created'
  // L5 audit chain — fires after every appendAudit(); entity_type +
  // event_type are in the cascade data payload.
  | 'audit.event_appended'
  | 'audit.merkle_root_published' | 'audit.merkle_root_cosigned'
  | 'audit.attestor_added'
  // ─── National-scale expansion (PR-National-1/2/3) ─────────────────────
  // Regulator
  | 'regulator.licence_granted' | 'regulator.licence_varied'
  | 'regulator.licence_suspended' | 'regulator.licence_revoked' | 'regulator.licence_reinstated'
  | 'regulator.tariff_submitted' | 'regulator.tariff_hearing_scheduled'
  | 'regulator.tariff_determined' | 'regulator.determination_published'
  | 'regulator.enforcement_opened' | 'regulator.enforcement_finding'
  | 'regulator.enforcement_appealed'
  | 'regulator.surveillance_alert_raised' | 'regulator.surveillance_escalated'
  // Grid operator
  | 'grid.schedule_published' | 'grid.instruction_issued' | 'grid.instruction_acked'
  | 'grid.instruction_non_compliant' | 'grid.curtailment_issued' | 'grid.curtailment_lifted'
  | 'grid.ancillary_tender_opened' | 'grid.ancillary_tender_cleared'
  | 'grid.outage_reported' | 'grid.outage_restored'
  | 'grid.connection_advanced'
  // Trader risk
  | 'trader.credit_limit_set' | 'trader.margin_call_issued' | 'trader.margin_call_met'
  | 'trader.collateral_movement' | 'trader.clearing_run_complete'
  | 'trader.algo_rule_created'
  // Lender
  | 'lender.covenant_breach' | 'lender.covenant_warn' | 'lender.covenant_waived'
  | 'lender.covenant_updated' | 'lender.covenant_added'
  | 'lender.waiver_requested' | 'lender.waiver_decided'
  | 'lender.ie_submitted' | 'lender.ie_certified' | 'lender.ie_rejected'
  | 'lender.waterfall_defined' | 'lender.waterfall_executed'
  | 'lender.reserve_opened' | 'lender.reserve_movement' | 'lender.reserve_drawn'
  | 'lender.stress_run_completed'
  | 'lender.action_filed' | 'lender.action_transitioned'
  | 'disbursement.requested' | 'disbursement.approved'
  // IPP lifecycle
  | 'ipp.epc_variation_raised' | 'ipp.ld_assessed'
  | 'ipp.ea_granted' | 'ipp.ea_condition_breach' | 'ipp.insurance_expiring'
  | 'ipp.insurance_claim_filed' | 'ipp.community_grievance_logged'
  // Offtaker
  | 'offtaker.rec_issued' | 'offtaker.rec_retired'
  | 'offtaker.scope2_published' | 'offtaker.budget_exceeded'
  // Carbon
  | 'carbon.vintage_issued' | 'carbon.mrv_submitted' | 'carbon.mrv_verified'
  | 'carbon.tax_claim_submitted'
  // Platform admin
  | 'tenant.provisioned' | 'tenant.suspended' | 'tenant.reactivated'
  | 'tenant.subscription_created' | 'tenant.invoice_issued'
  | 'flag.changed' | 'flag.override_set'
  // Vault (POPIA s.23 access traceability for documents stored in R2)
  | 'vault.file_uploaded' | 'vault.file_deleted'
  // ─── Watershed parity (migration 040) ────────────────────────────────
  | 'pcaf.financed_emissions_recorded' | 'pcaf.facilitated_emissions_recorded'
  | 'pcaf.target_committed'
  | 'cdr.project_listed' | 'cdr.offtake_signed' | 'cdr.retirement_recorded'
  | 'cfe.score_computed'
  | 'pcf.published'
  | 'assurance.engagement_opened' | 'assurance.finding_raised' | 'assurance.opinion_issued'
  | 'maturity.assessed'
  | 'anomaly.detected'
  | 'disclosure.jurisdiction_filed'
  // ─── Watershed advanced (migration 042) ───────────────────────────────
  | 'pcaf.insurance_recorded'
  | 'pcaf.counterparty_data_request_sent' | 'pcaf.counterparty_data_submitted'
  | 'scenario.run_completed'
  | 'ai.classification_logged'
  | 'audit_chain.appended'
  | 'rec_market.listed' | 'rec_market.traded'
  // ─── Trading clearing L5 (block trades, surveillance, mm, default fund) ─
  | 'block_trade.reported' | 'block_trade.confirmed' | 'block_trade.published' | 'block_trade.bust'
  | 'surveillance.alert_raised' | 'surveillance.alert_reviewed' | 'surveillance.alert_reported'
  | 'mm.obligation_awarded' | 'mm.performance_recorded'
  | 'clearing.fund_created' | 'clearing.contribution_posted' | 'clearing.loss_event_executed'
  // ─── Grid L5 (constraints, dispatch, ancillary, frequency, wheeling, blackstart) ─
  | 'grid.constraint_added' | 'grid.constraint_deactivated'
  | 'grid.dispatch_run_created' | 'grid.dispatch_run_optimized' | 'grid.dispatch_run_published'
  | 'grid.ancillary_contract_awarded' | 'grid.ancillary_dispatched'
  | 'grid.frequency_event_recorded'
  | 'grid.wheeling_agreement_created' | 'grid.wheeling_agreement_approved'
  | 'grid.blackstart_unit_registered' | 'grid.blackstart_test_recorded'
  // ─── Marketplace L5 (RFQ, negotiation, auction) ─────────────────────────
  | 'marketplace.rfq_created' | 'marketplace.rfq_published'
  | 'marketplace.rfq_evaluation_started' | 'marketplace.rfq_awarded'
  | 'marketplace.rfq_negotiation_initiated' | 'marketplace.rfq_negotiation_decided'
  | 'marketplace.auction_created' | 'marketplace.auction_closed' | 'marketplace.auction_failed'
  // ─── Trading deep (algo, limits, breaches) ──────────────────────────────
  | 'trader.algo_execution_submitted' | 'trader.algo_paused' | 'trader.algo_resumed' | 'trader.algo_cancelled'
  | 'trader.position_limit_set'
  | 'trader.position_breach_detected' | 'trader.position_breach_override' | 'trader.position_breach_cleared'
  // ─── Auth deep (POPIA-grade access control) ─────────────────────────────
  | 'auth.mfa_verified' | 'auth.mfa_failed' | 'auth.mfa_locked_out' | 'auth.mfa_lockout_cleared'
  | 'auth.webauthn_credential_registered' | 'auth.webauthn_credential_revoked'
  | 'auth.device_trusted' | 'auth.device_revoked'
  | 'auth.mfa_policy_changed'
  // ─── KYC-deep (FICA tiered KYC + PEP/sanctions + AML) ───────────────────
  | 'kyc.tier_upgrade_requested' | 'kyc.tier_applied'
  | 'kyc.screening_completed' | 'kyc.screening_reviewed'
  | 'kyc.risk_score_computed'
  | 'kyc.beneficial_owner_added'
  // ─── Business depth (waivers, variation orders, prime rate) ─────────────
  | 'settlement.late_fee_waived' | 'settlement.late_fee_charged'
  | 'settlement.prime_rate_updated'
  | 'ipp.variation_order_raised'
  | 'ipp.variation_order_lender_decided' | 'ipp.variation_order_offtaker_decided'
  | 'ipp.variation_order_approved' | 'ipp.variation_order_rejected'
  | 'ipp.variation_order_withdrawn'
  // ─── Documents (templates + envelopes) ──────────────────────────────────
  | 'document.template_created' | 'document.template_published' | 'document.template_deprecated'
  | 'document.envelope_created' | 'document.envelope_signed'
  | 'document.envelope_completed' | 'document.envelope_cancelled'
  // ─── POPIA-deep (info officer / SAR / retention) ────────────────────────
  | 'popia.sar_received' | 'popia.sar_assigned' | 'popia.sar_responded'
  | 'popia.retention_policy_updated'
  // ─── Polish (Ed25519 signatures) ────────────────────────────────────────
  | 'document.signature_created'
  // ─── Bulk ops (CSV import + bulk update) ────────────────────────────────
  | 'bulk.import_completed' | 'bulk.update_applied'
  // ─── Regulator filings ──────────────────────────────────────────────────
  | 'regulator.filing_created' | 'regulator.filing_updated'
  | 'regulator.filing_submitted' | 'regulator.filing_archived'
  | 'regulator.filing_deleted' | 'regulator.filing_ai_generated'
  // ─── IPP deep (drawdowns + LD engine) ──────────────────────────────────
  | 'ipp.drawdown_requested' | 'ipp.drawdown_cp_waived'
  | 'ipp.drawdown_approved' | 'ipp.drawdown_disbursed'
  | 'ipp.ld_event_raised' | 'ipp.ld_event_cured'
  // ─── Lender deep (IFRS 9 + watchlist + intercreditor) ──────────────────
  | 'lender.ecl_computed' | 'lender.watchlist_added'
  | 'lender.watchlist_cleared' | 'lender.intercreditor_agreed'
  // Wave 6 — dunning workflow
  | 'lender.dunning_issued' | 'lender.dunning_acked' | 'lender.dunning_cured'
  | 'lender.dunning_overdue' | 'lender.dunning_cycle_escalated'
  | 'lender.watchlist_tier_escalated' | 'lender.watchlist_critical_escalation'
  // ─── Carbon deep (PDD + monitoring + verification) ─────────────────────
  | 'carbon.pdd_registered' | 'carbon.credits_issued'
  | 'carbon.verification_transitioned'
  // ─── Offtaker delivery points CRUD ─────────────────────────────────────
  | 'offtaker.delivery_point_created' | 'offtaker.delivery_point_updated'
  | 'offtaker.delivery_point_deleted'
  // Wave 7 — PPA delivery-obligation workflow
  | 'offtaker.reading_submitted' | 'offtaker.reading_verified'
  | 'offtaker.reading_rejected' | 'offtaker.reading_reversed'
  | 'offtaker.obligation_shortfall' | 'offtaker.obligation_cured'
  | 'offtaker.obligation_take_or_pay'
  // Wave 8 — Grid wheeling charge reconciliation
  | 'grid.wheeling_charge_issued' | 'grid.wheeling_charge_disputed'
  | 'grid.wheeling_charge_paid' | 'grid.wheeling_dispute_resolved'
  | 'grid.wheeling_charge_escalated'
  // Wave 9 — Trader MM breach lifecycle
  | 'trader.mm_compliance_recorded' | 'trader.mm_obligation_warning'
  | 'trader.mm_obligation_breach' | 'trader.mm_obligation_breach_escalated'
  | 'trader.mm_obligation_recovered' | 'trader.mm_obligation_acknowledged'
  | 'trader.mm_performance_excused'
  // Wave 10 — IPP performance-bond + insurance expiry escalation
  | 'ipp.bond_warning' | 'ipp.bond_cycle_1_notice'
  | 'ipp.bond_cycle_2_notice' | 'ipp.bond_cycle_3_notice'
  | 'ipp.bond_expiry_escalated' | 'ipp.bond_acknowledged'
  | 'ipp.bond_released' | 'ipp.bond_replaced' | 'ipp.bond_forfeited'
  // Wave 11 — Carbon Article 6 / UNFCCC MRV verification chain
  | 'carbon.mrv_chain_submitted' | 'carbon.mrv_doe_assigned'
  | 'carbon.mrv_doe_review_started' | 'carbon.mrv_doe_opinion_recorded'
  | 'carbon.mrv_cra_submitted' | 'carbon.mrv_cra_approved' | 'carbon.mrv_cra_rejected'
  | 'carbon.mrv_issuance_authorized' | 'carbon.mrv_issued'
  | 'carbon.mrv_sla_breached' | 'carbon.mrv_withdrawn'
  // Wave 12 — Esums site commissioning chain
  | 'esums.site_registered' | 'esums.devices_registered'
  | 'esums.ingestion_wired' | 'esums.first_telemetry_ok'
  | 'esums.site_energised' | 'esums.site_in_om'
  | 'esums.commissioning_failed' | 'esums.site_decommissioned'
  | 'esums.commissioning_sla_breached'
  // Wave 13 — Grid operator dispatch nomination chain (P6)
  | 'dispatch.nominated' | 'dispatch.accepted' | 'dispatch.activated'
  | 'dispatch.performance_recorded' | 'dispatch.settled' | 'dispatch.closed'
  | 'dispatch.nomination_rejected' | 'dispatch.dispute_raised'
  | 'dispatch.dispute_resolved' | 'dispatch.closed_disputed'
  | 'dispatch.sla_breached'
  // Wave 14 — Support ticket P6 chain (priority-tiered SLAs + regulator crossings)
  | 'support.ticket_triaged' | 'support.ticket_picked_up'
  | 'support.ticket_awaiting_user' | 'support.ticket_user_responded'
  | 'support.ticket_resolved' | 'support.ticket_closed'
  | 'support.ticket_reopened' | 'support.ticket_escalated'
  | 'support.ticket_sla_breached'
  // Wave 15 — OEM warranty / RMA claim chain (severity-tiered SLAs + safety crossings)
  | 'warranty.claim_opened' | 'warranty.claim_triaged'
  | 'warranty.claim_submitted' | 'warranty.claim_acknowledged'
  | 'warranty.claim_review_started' | 'warranty.claim_approved'
  | 'warranty.claim_denied' | 'warranty.claim_disputed'
  | 'warranty.claim_fulfilled' | 'warranty.claim_closed'
  | 'warranty.claim_sla_breached'
  // Wave 16 — Work-order dispatch chain (Esums O&M)
  | 'wo.assigned' | 'wo.acknowledged' | 'wo.departed' | 'wo.arrived'
  | 'wo.diagnosed' | 'wo.repair_started' | 'wo.tested' | 'wo.completed'
  | 'wo.verified' | 'wo.closed' | 'wo.cancelled'
  | 'wo.sla_breached'
  // Wave 17 — Carbon credit retirement chain (Article 6 / compliance / voluntary)
  | 'carbon.retirement.validation_started' | 'carbon.retirement.adjustment_pending'
  | 'carbon.retirement.adjusted' | 'carbon.retirement.retired'
  | 'carbon.retirement.rejected' | 'carbon.retirement.cancelled'
  | 'carbon.retirement.sla_breached'
  // Wave 18 — Planned outage submission chain (NERSA Grid Code §C-1.3)
  | 'outage.submitted' | 'outage.review_started' | 'outage.approved'
  | 'outage.rejected' | 'outage.rescheduled' | 'outage.notified'
  | 'outage.commenced' | 'outage.restore_started' | 'outage.restored'
  | 'outage.closed' | 'outage.cancelled' | 'outage.sla_breached'
  // Wave 19 — IPP procurement / RFP chain (REIPPPP-aligned transparency)
  | 'procurement.published' | 'procurement.bid_opened' | 'procurement.bid_closed'
  | 'procurement.evaluation_started' | 'procurement.shortlisted'
  | 'procurement.awarded' | 'procurement.contracted' | 'procurement.delivered'
  | 'procurement.rejected' | 'procurement.cancelled'
  | 'procurement.disputed' | 'procurement.resolved' | 'procurement.sla_breached'
  // Wave 20 — IPP construction → COD certification chain (NERSA §C-5 + DMRE registry)
  | 'cod.epc_signed' | 'cod.ntp_issued' | 'cod.mobilized'
  | 'cod.mechanical_complete' | 'cod.cold_commissioned'
  | 'cod.grid_synchronized' | 'cod.reliability_started'
  | 'cod.cod_certified' | 'cod.cancelled' | 'cod.sla_breached'
  // Wave 21 — Lender drawdown / disbursement certification chain (SARB + REIPPPP)
  | 'drawdown.documents_submitted' | 'drawdown.ie_review_started'
  | 'drawdown.cp_passed' | 'drawdown.queried' | 'drawdown.resumed'
  | 'drawdown.approved' | 'drawdown.funded' | 'drawdown.closed'
  | 'drawdown.rejected' | 'drawdown.cancelled' | 'drawdown.sla_breached'
  // Wave 22 — Offtaker PPA contract execution lifecycle (NERSA Section 34)
  | 'ppa_contract.negotiation_started' | 'ppa_contract.terms_locked'
  | 'ppa_contract.legal_signed' | 'ppa_contract.executed'
  | 'ppa_contract.commenced' | 'ppa_contract.disputed' | 'ppa_contract.resolved'
  | 'ppa_contract.terminated' | 'ppa_contract.expired' | 'ppa_contract.cancelled'
  | 'ppa_contract.sla_breached'
  // Wave 23 — Insurance claim chain (FSCA Section 38)
  | 'insurance_claim.notified' | 'insurance_claim.assessing'
  | 'insurance_claim.adjuster_assigned' | 'insurance_claim.quantum_proposed'
  | 'insurance_claim.quantum_agreed' | 'insurance_claim.disputed' | 'insurance_claim.dispute_resolved'
  | 'insurance_claim.settled' | 'insurance_claim.declined'
  | 'insurance_claim.closed' | 'insurance_claim.withdrawn'
  | 'insurance_claim.sla_breached'
  // Wave 24 — Esums PR sustained-underperformance chain
  | 'pr_chain.warning' | 'pr_chain.investigating'
  | 'pr_chain.intervention_planned' | 'pr_chain.intervention_executing'
  | 'pr_chain.verified' | 'pr_chain.closed'
  | 'pr_chain.escalated' | 'pr_chain.false_alarm'
  | 'pr_chain.sla_breached'
  // Wave 25 — HSE/SHEQ incident chain (OHSA s24 + NEMA s30)
  | 'hse_incident.triaged' | 'hse_incident.notified_authority'
  | 'hse_incident.investigating'
  | 'hse_incident.corrective_actions_planned' | 'hse_incident.corrective_actions_executing'
  | 'hse_incident.verified' | 'hse_incident.closed'
  | 'hse_incident.escalated' | 'hse_incident.false_alarm'
  | 'hse_incident.sla_breached'
  // Wave 26 — Cybersecurity / POPIA s22 / Cybercrimes Act s54 incident chain
  | 'cyber_incident.triaged' | 'cyber_incident.contained'
  | 'cyber_incident.notified_regulator' | 'cyber_incident.notified_subjects'
  | 'cyber_incident.investigating'
  | 'cyber_incident.remediation_planned' | 'cyber_incident.remediation_executing'
  | 'cyber_incident.verified' | 'cyber_incident.closed'
  | 'cyber_incident.escalated' | 'cyber_incident.false_alarm'
  | 'cyber_incident.sla_breached'
  // Wave 27 — REIPPPP Economic Development (ED) commitment monitoring chain
  | 'ed_commitment.monitoring' | 'ed_commitment.variance_flagged'
  | 'ed_commitment.cure_plan_required' | 'ed_commitment.cure_plan_submitted'
  | 'ed_commitment.cure_executing'
  | 'ed_commitment.verified_compliant' | 'ed_commitment.closed'
  | 'ed_commitment.penalty_issued'
  | 'ed_commitment.escalated' | 'ed_commitment.false_alarm'
  | 'ed_commitment.sla_breached'
  // Wave 28 — Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1
  | 'gca.application_filed' | 'gca.studies_required' | 'gca.studies_executing'
  | 'gca.cost_estimate_issued' | 'gca.cost_accepted'
  | 'gca.connection_agreement_drafted' | 'gca.executed'
  | 'gca.construction' | 'gca.energised' | 'gca.in_service'
  | 'gca.rejected' | 'gca.withdrawn'
  | 'gca.sla_breached'
  // Wave 29 — Trader Position Limit Compliance chain — FSCA Section 41
  | 'poslimit.warning' | 'poslimit.soft_breach' | 'poslimit.hard_breach'
  | 'poslimit.margin_call_issued' | 'poslimit.reduction_required'
  | 'poslimit.reduction_executing' | 'poslimit.cured'
  | 'poslimit.escalated' | 'poslimit.false_alarm'
  | 'poslimit.sla_breached'
  // Wave 30 — Lender Disbursement UoP Reconciliation chain — SARB + Equator Principles
  | 'disbursement.invoices_pending' | 'disbursement.invoices_submitted'
  | 'disbursement.bank_validating' | 'disbursement.ie_certifying'
  | 'disbursement.uop_certified' | 'disbursement.reconciled'
  | 'disbursement.clawback_executed' | 'disbursement.waived'
  | 'disbursement.sla_breached'
  // Wave 31 — Regulator Compliance Notice Disposition chain — NERSA Act §10
  | 'disposition.triaged' | 'disposition.assigned'
  | 'disposition.investigating' | 'disposition.action_required'
  | 'disposition.action_in_progress' | 'disposition.action_completed'
  | 'disposition.closed' | 'disposition.escalated'
  | 'disposition.dismissed' | 'disposition.referred'
  | 'disposition.sla_breached'
  // Wave 32 — Offtaker Take-or-Pay Annual Reconciliation chain
  | 'top.year_end' | 'top.statement_issued'
  | 'top.evidence_required' | 'top.evidence_submitted'
  | 'top.quantum_proposed' | 'top.quantum_agreed'
  | 'top.settled' | 'top.disputed' | 'top.waived'
  | 'top.sla_breached'
  // Wave 33 — Regulator Licence Renewal / Amendment chain (NERSA s14-s16)
  | 'licence_renewal.initiated' | 'licence_renewal.application_filed'
  | 'licence_renewal.completeness_checked' | 'licence_renewal.consultation_opened'
  | 'licence_renewal.evaluation_started' | 'licence_renewal.decision_drafted'
  | 'licence_renewal.council_voted'
  | 'licence_renewal.granted' | 'licence_renewal.amended' | 'licence_renewal.refused'
  | 'licence_renewal.withdrawn'
  | 'licence_renewal.sla_breached'
  // Wave 34 — Grid CSC-1 Load Curtailment / Emergency Load Reduction chain
  | 'load_curtailment.instruction_issued' | 'load_curtailment.acknowledged'
  | 'load_curtailment.curtailment_started' | 'load_curtailment.target_achieved'
  | 'load_curtailment.instruction_lifted' | 'load_curtailment.reconciled'
  | 'load_curtailment.post_mortem_opened' | 'load_curtailment.post_mortem_closed'
  | 'load_curtailment.closed'
  | 'load_curtailment.refused' | 'load_curtailment.partial_compliance'
  | 'load_curtailment.withdrawn'
  | 'load_curtailment.sla_breached'
  // Wave 35 — Esums O&M Warranty Vendor-Side Escalation chain (CPA §56/§61 + NRCS)
  | 'vendor_escalation.filed' | 'vendor_escalation.vendor_triage'
  | 'vendor_escalation.vendor_decision' | 'vendor_escalation.escalated_to_oem'
  | 'vendor_escalation.oem_field_investigation' | 'vendor_escalation.oem_decision'
  | 'vendor_escalation.remediation' | 'vendor_escalation.closed'
  | 'vendor_escalation.recall_issued' | 'vendor_escalation.arbitration'
  | 'vendor_escalation.withdrawn'
  | 'vendor_escalation.sla_breached'
  // Wave 36 — Trader Best-Execution / RFQ Compliance chain (FSCA Conduct Standard 1 of 2020 + FAIS)
  | 'best_execution.quotes_solicited' | 'best_execution.quotes_received'
  | 'best_execution.best_ex_evaluated' | 'best_execution.execution_approved'
  | 'best_execution.executed' | 'best_execution.override_executed'
  | 'best_execution.tca_reviewed' | 'best_execution.closed'
  | 'best_execution.exception_escalated' | 'best_execution.rfq_expired'
  | 'best_execution.sla_breached'
  // Wave 37 — Carbon Project Registration / PDD Validation chain (Gold Standard + Verra VCS + Article 6.4 + SA DFFE DNA)
  | 'carbon_registration.pdd_drafted' | 'carbon_registration.validation_underway'
  | 'carbon_registration.corrections_required' | 'carbon_registration.public_consultation'
  | 'carbon_registration.dna_authorization' | 'carbon_registration.registration_requested'
  | 'carbon_registration.registered' | 'carbon_registration.crediting_active'
  | 'carbon_registration.rejected' | 'carbon_registration.withdrawn'
  | 'carbon_registration.sla_breached'
  // Wave 38 — Lender Covenant Compliance Certificate chain (LMA + Equator Principles + SARB large-exposure)
  | 'covenant_certificate.certificate_submitted' | 'covenant_certificate.under_review'
  | 'covenant_certificate.ratios_verified' | 'covenant_certificate.compliant'
  | 'covenant_certificate.breach_identified' | 'covenant_certificate.waiver_requested'
  | 'covenant_certificate.waiver_granted' | 'covenant_certificate.cure_period'
  | 'covenant_certificate.cured' | 'covenant_certificate.accelerated'
  | 'covenant_certificate.sla_breached'
  // Wave 39 — Offtaker PPA Tariff Indexation / CPI Escalation chain (NERSA ERA §4 + IFRS 16)
  | 'tariff_indexation.index_published' | 'tariff_indexation.escalation_calculated'
  | 'tariff_indexation.notice_issued' | 'tariff_indexation.under_review'
  | 'tariff_indexation.tariff_agreed' | 'tariff_indexation.applied'
  | 'tariff_indexation.disputed' | 'tariff_indexation.recalculated'
  | 'tariff_indexation.arbitrated' | 'tariff_indexation.withdrawn'
  | 'tariff_indexation.sla_breached'
  // Wave 40 — Regulator Compliance Inspection & Enforcement chain (NERSA ERA §10 + §34/§35)
  | 'compliance_inspection.inspection_in_progress' | 'compliance_inspection.findings_drafted'
  | 'compliance_inspection.findings_issued' | 'compliance_inspection.directive_issued'
  | 'compliance_inspection.remediation_underway' | 'compliance_inspection.remediation_verified'
  | 'compliance_inspection.penalty_imposed' | 'compliance_inspection.appealed'
  | 'compliance_inspection.compliant_closed' | 'compliance_inspection.enforcement_closed'
  | 'compliance_inspection.withdrawn' | 'compliance_inspection.sla_breached'
  // Wave 41 — OEM-Support ITIL Problem Management chain (ITIL 4 + ISO/IEC 20000-1 §8.6.3)
  | 'problem_management.categorized' | 'problem_management.investigating'
  | 'problem_management.rca_identified' | 'problem_management.known_error'
  | 'problem_management.fix_proposed' | 'problem_management.change_raised'
  | 'problem_management.fix_deployed' | 'problem_management.resolution_verified'
  | 'problem_management.closed' | 'problem_management.escalated'
  | 'problem_management.cancelled' | 'problem_management.sla_breached'
  // Wave 42 — Carbon Reversal / Buffer-Pool & Permanence Management chain (Verra VCS / Gold Standard / Article 6.4)
  | 'carbon_reversal.under_assessment' | 'carbon_reversal.loss_quantified'
  | 'carbon_reversal.buffer_cancellation_proposed' | 'carbon_reversal.buffer_cancelled'
  | 'carbon_reversal.remediation_verified' | 'carbon_reversal.replacement_required'
  | 'carbon_reversal.replacement_submitted' | 'carbon_reversal.replacement_verified'
  | 'carbon_reversal.closed' | 'carbon_reversal.escalated'
  | 'carbon_reversal.false_alarm' | 'carbon_reversal.sla_breached'
  // Wave 43 — Regulator Tariff / Revenue (MYPD Price-Control) Determination chain (ERA §15–§16 + MYPD + RCA)
  | 'tariff_determination.completeness_review' | 'tariff_determination.public_consultation'
  | 'tariff_determination.revenue_analysis' | 'tariff_determination.draft_determination'
  | 'tariff_determination.council_deliberation' | 'tariff_determination.determination_issued'
  | 'tariff_determination.reconsideration_requested' | 'tariff_determination.implemented'
  | 'tariff_determination.remitted' | 'tariff_determination.rejected'
  | 'tariff_determination.withdrawn' | 'tariff_determination.sla_breached'
  // Wave 44 — Trader OTC Transaction / Trade-Repository Reporting & Reconciliation chain (FMA + FSCA OTC reporting)
  | 'trade_report.report_generated' | 'trade_report.submitted_to_tr'
  | 'trade_report.tr_acknowledged' | 'trade_report.reconciled'
  | 'trade_report.break_identified' | 'trade_report.break_resolved'
  | 'trade_report.confirmed_complete' | 'trade_report.tr_rejected'
  | 'trade_report.corrected' | 'trade_report.exempted'
  | 'trade_report.cancelled' | 'trade_report.sla_breached'
  // Wave 45 — Lender Loan Default & Enforcement / Step-in chain (LMA EoD + SARB impairment + Insolvency/Companies Act business-rescue)
  | 'loan_default.under_review' | 'loan_default.reservation_of_rights'
  | 'loan_default.default_notice_issued' | 'loan_default.cure_period'
  | 'loan_default.cured' | 'loan_default.accelerated'
  | 'loan_default.standstill' | 'loan_default.enforcement_commenced'
  | 'loan_default.restructured' | 'loan_default.enforced_closed'
  | 'loan_default.written_off' | 'loan_default.sla_breached'
  // Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation chain (REIPPPP/PPA deemed-energy + NERSA Grid Code economic-dispatch curtailment)
  | 'curtailment_claim.classification_review' | 'curtailment_claim.claim_prepared'
  | 'curtailment_claim.claim_submitted' | 'curtailment_claim.validation_underway'
  | 'curtailment_claim.quantum_proposed' | 'curtailment_claim.quantum_agreed'
  | 'curtailment_claim.compensation_settled' | 'curtailment_claim.disputed'
  | 'curtailment_claim.arbitrated' | 'curtailment_claim.non_compensable'
  | 'curtailment_claim.withdrawn' | 'curtailment_claim.sla_breached'
  // Wave 47 — OEM-Support ITIL Change Enablement chain (RFC lifecycle; ITIL 4 Change Enablement + ISO/IEC 20000-1 §8.5.1)
  | 'change_enablement.assessment' | 'change_enablement.cab_review'
  | 'change_enablement.approved' | 'change_enablement.scheduled'
  | 'change_enablement.implementing' | 'change_enablement.implemented'
  | 'change_enablement.pir' | 'change_enablement.closed'
  | 'change_enablement.rejected' | 'change_enablement.rolled_back'
  | 'change_enablement.cancelled' | 'change_enablement.sla_breached'
  // Wave 48 — Carbon Tax Offset Claim & Allowance lifecycle chain (Carbon Tax Act §13 + GNR 1556 + DFFE COAS + SARS eFiling)
  | 'carbon_offset_claim.eligibility_screening' | 'carbon_offset_claim.credits_earmarked'
  | 'carbon_offset_claim.claim_submitted' | 'carbon_offset_claim.sars_review'
  | 'carbon_offset_claim.sars_query' | 'carbon_offset_claim.allowance_granted'
  | 'carbon_offset_claim.applied_to_return' | 'carbon_offset_claim.reconciled'
  | 'carbon_offset_claim.rejected' | 'carbon_offset_claim.clawed_back'
  | 'carbon_offset_claim.withdrawn' | 'carbon_offset_claim.sla_breached'
  // Wave 49 — Regulator Initial Licence Application & Adjudication chain (ERA 2006 §§8–11 + NERSA §9/§10 + Government Gazette)
  | 'licence_application.completeness_review' | 'licence_application.additional_info_requested'
  | 'licence_application.accepted' | 'licence_application.public_participation'
  | 'licence_application.technical_evaluation' | 'licence_application.council_decision'
  | 'licence_application.licence_granted' | 'licence_application.licence_issued'
  | 'licence_application.refused' | 'licence_application.withdrawn'
  | 'licence_application.lapsed' | 'licence_application.sla_breached'
  // Wave 50 — Grid Ancillary Services Reserve Activation & Settlement chain (NERSA Grid Code + System Operation Code; settle + settle_penalty share .settled)
  | 'reserve_activation.acknowledged' | 'reserve_activation.ramping'
  | 'reserve_activation.sustaining' | 'reserve_activation.released'
  | 'reserve_activation.performance_review' | 'reserve_activation.verified'
  | 'reserve_activation.settled' | 'reserve_activation.non_performance'
  | 'reserve_activation.disputed' | 'reserve_activation.dispute_resolved'
  | 'reserve_activation.withdrawn' | 'reserve_activation.sla_breached'
  // Wave 51 — Esums O&M Availability Guarantee & Liquidated Damages chain (IEC 61724/62446 + REIPPPP O&M agreement; settle + waive_ld share .settled)
  | 'availability_guarantee.measurement_submitted' | 'availability_guarantee.adjustment_review'
  | 'availability_guarantee.reconciled' | 'availability_guarantee.meets_guarantee'
  | 'availability_guarantee.shortfall_flagged' | 'availability_guarantee.ld_assessed'
  | 'availability_guarantee.cure_period' | 'availability_guarantee.settled'
  | 'availability_guarantee.disputed' | 'availability_guarantee.dispute_resolved'
  | 'availability_guarantee.withdrawn' | 'availability_guarantee.sla_breached'
  // Wave 52 — Trader Market Abuse Surveillance & STOR chain (FMA 2012 Ch X + FSCA market-abuse; clear + dismiss share .cleared; file_stor crosses for every tier)
  | 'market_abuse.triaged' | 'market_abuse.under_investigation'
  | 'market_abuse.evidence_review' | 'market_abuse.analysis_complete'
  | 'market_abuse.cleared' | 'market_abuse.stor_filed'
  | 'market_abuse.regulator_referred' | 'market_abuse.enforcement_action'
  | 'market_abuse.sanctioned' | 'market_abuse.disputed'
  | 'market_abuse.dispute_resolved' | 'market_abuse.sla_breached'
  // Wave 53 — Lender Credit Facility Origination & Credit Approval chain (NCA 34/2005 + Banks Act + Basel III + SARB large-exposure + LMA; activate crosses for major/systemic = the W53 signature; satisfy_conditions shares .approved)
  | 'credit_origination.screening' | 'credit_origination.credit_assessment'
  | 'credit_origination.committee_review' | 'credit_origination.referred_back'
  | 'credit_origination.conditions_pending' | 'credit_origination.approved'
  | 'credit_origination.agreement_issued' | 'credit_origination.cp_satisfied'
  | 'credit_origination.facility_available' | 'credit_origination.declined'
  | 'credit_origination.withdrawn' | 'credit_origination.sla_breached'
  // Wave 54 — Offtaker PPA Payment Security / Credit Support Instrument chain (REIPPPP/bilateral PPA payment-security + NERSA s34 bankability + LMA credit-support; URGENT SLA; forfeit crosses EVERY tier = the W54 signature; confirm_adequate shares .active)
  | 'payment_security.instrument_submitted' | 'payment_security.under_verification'
  | 'payment_security.active' | 'payment_security.rejected'
  | 'payment_security.adequacy_review' | 'payment_security.substitution_pending'
  | 'payment_security.drawdown_initiated' | 'payment_security.replenishment_pending'
  | 'payment_security.expiry_pending' | 'payment_security.released'
  | 'payment_security.forfeited' | 'payment_security.sla_breached'
  // Wave 55 — OEM-Support Firmware / Security-Patch & Vulnerability Remediation chain (IEC 62443-2-3 patch mgmt + ISO/IEC 27001 A.8.8 + ITIL 4 Information Security Mgmt)
  | 'security_remediation.triaged' | 'security_remediation.impact_assessment'
  | 'security_remediation.mitigation_applied' | 'security_remediation.fleet_scoped'
  | 'security_remediation.remediation_approved' | 'security_remediation.rollout_in_progress'
  | 'security_remediation.verification' | 'security_remediation.resolved'
  | 'security_remediation.not_affected' | 'security_remediation.risk_accepted'
  | 'security_remediation.rolled_back' | 'security_remediation.sla_breached'
  // Wave 56 — Carbon Crediting-Period Renewal & Baseline Reassessment chain (Verra VCS v4 + Gold Standard + Article 6.4 + CDM + DFFE DNA)
  | 'crediting_renewal.application_submitted' | 'crediting_renewal.completeness_check'
  | 'crediting_renewal.revision_requested' | 'crediting_renewal.baseline_reassessment'
  | 'crediting_renewal.additionality_retest' | 'crediting_renewal.vvb_validation'
  | 'crediting_renewal.standard_review' | 'crediting_renewal.renewed'
  | 'crediting_renewal.refused' | 'crediting_renewal.withdrawn'
  | 'crediting_renewal.lapsed' | 'crediting_renewal.sla_breached'
  // Wave 57 — Regulator Embedded-Generation Registration & Schedule 2 Exemption chain (NERSA ERA 2006 Schedule 2)
  | 'sseg_registration.eligibility_screening' | 'sseg_registration.information_requested'
  | 'sseg_registration.technical_verification' | 'sseg_registration.exemption_determination'
  | 'sseg_registration.conditions_pending' | 'sseg_registration.registration_approved'
  | 'sseg_registration.registered' | 'sseg_registration.referred_to_licensing'
  | 'sseg_registration.refused' | 'sseg_registration.withdrawn'
  | 'sseg_registration.lapsed' | 'sseg_registration.sla_breached'
  // Wave 58 — Grid Connection Capacity Allocation & Queue Management chain (NERSA Grid Code + NTCSA Interim Capacity Allocation Rules 2024)
  | 'grid_capacity.completeness_screening' | 'grid_capacity.information_requested'
  | 'grid_capacity.capacity_assessment' | 'grid_capacity.queue_positioned'
  | 'grid_capacity.offer_issued' | 'grid_capacity.capacity_reserved'
  | 'grid_capacity.capacity_allocated' | 'grid_capacity.rejected'
  | 'grid_capacity.lapsed' | 'grid_capacity.relinquished'
  | 'grid_capacity.withdrawn' | 'grid_capacity.sla_breached'
  // Wave 59 — Esums Preventive-Maintenance Schedule Compliance & Deferral chain (IEC 62446/61724 + REIPPPP O&M PM program; URGENT SLA; skip_pm crosses for critical tiers + approve_deferral crosses for safety_critical = the W59 signature; reject_deferral shares .work_assigned)
  | 'pm_compliance.work_assigned' | 'pm_compliance.in_progress'
  | 'pm_compliance.on_hold' | 'pm_compliance.completed'
  | 'pm_compliance.verification_pending' | 'pm_compliance.rework_required'
  | 'pm_compliance.closed' | 'pm_compliance.deferral_requested'
  | 'pm_compliance.deferred' | 'pm_compliance.skipped'
  | 'pm_compliance.cancelled' | 'pm_compliance.sla_breached'
  // Wave 60 — Trader Algorithmic / DEA Trading-System Certification & Kill-Switch chain (FMA 2012 + FSCA automated-trading + JSE algo/DEA + MiFID II RTS 6; INVERTED SLA; invoke_kill_switch (→ suspended) crosses for EVERY tier = the W60 signature; reject_certification + sla_breached cross for high tiers; deploy/complete_recertification/reinstate share .deployed; begin_review/resubmit share .documentation_review)
  | 'algo_certification.documentation_review' | 'algo_certification.conformance_testing'
  | 'algo_certification.risk_controls_validation' | 'algo_certification.certification_review'
  | 'algo_certification.certified' | 'algo_certification.deployed'
  | 'algo_certification.recertification_review' | 'algo_certification.suspended'
  | 'algo_certification.remediation_required' | 'algo_certification.rejected'
  | 'algo_certification.decommissioned' | 'algo_certification.sla_breached'
  // Wave 61 — Lender Loan Transfer / Secondary Participation & Syndication chain (LMA Transfer Certificate + SARB Exchange Control + FIC Act 38/2001 KYC/AML + Banks Act large-exposure + Equator Principles; INVERTED SLA; approve_transfer to a NON-RESIDENT transferee crosses for EVERY tier = the W61 RESIDENCY-driven signature; fail_screening crosses for EVERY tier; complete crosses for large tiers; sla_breached crosses for large tiers; begin_screening/resubmit_screening share .kyc_screening)
  | 'loan_transfer.transfer_requested' | 'loan_transfer.kyc_screening'
  | 'loan_transfer.screening_remediation' | 'loan_transfer.consent_solicitation'
  | 'loan_transfer.regulatory_review' | 'loan_transfer.transfer_approved'
  | 'loan_transfer.certificate_executed' | 'loan_transfer.settled'
  | 'loan_transfer.completed' | 'loan_transfer.declined'
  | 'loan_transfer.rejected' | 'loan_transfer.withdrawn'
  | 'loan_transfer.sla_breached'
  // Wave 62 — Offtaker PPA Termination & Early-Termination Amount (Buy-Out) chain (NERSA ERA 4/2006 s34 + PPA event-of-default/cure/long-stop-FM/change-in-law + IFRS 9/16 debt-and-lease ETA treatment; MIXED SLA — cure/eta_assessment/dispute INVERTED, settlement_pending URGENT; CAUSE-driven signature: confirm_termination crosses for EVERY tier when the cause is involuntary (seller_default/buyer_default/change_in_law/prolonged_force_majeure), no_fault crosses for large tiers only; confirm_settlement + sla_breached cross for large tiers; resolve_dispute & agree_eta share .eta_agreed)
  | 'ppa_termination.notice_served' | 'ppa_termination.cure_period'
  | 'ppa_termination.reinstated' | 'ppa_termination.termination_review'
  | 'ppa_termination.termination_confirmed' | 'ppa_termination.eta_assessment'
  | 'ppa_termination.eta_agreed' | 'ppa_termination.disputed'
  | 'ppa_termination.settlement_pending' | 'ppa_termination.closed'
  | 'ppa_termination.withdrawn' | 'ppa_termination.sla_breached'
  // Wave 63 — OEM-Support Warranty-Recovery / Supplier-Recovery Claim chain (OEM supply-agreement warranty + serial-defect/epidemic-failure + NRCS safety-recall + CPA s55/s56/s61 + NERSA Grid Code reliability; MIXED SLA — claim_drafted/under_assessment/disputed INVERTED, recovery_pending URGENT; DEFECT-CLASS-driven signature: complete_assessment crosses for EVERY tier when defect is systemic (serial/safety), non-systemic crosses for large tiers only; write_off + sla_breached cross for large tiers; single-party write, resolve_dispute & approve_recovery share .approved)
  | 'warranty_recovery.submitted_to_oem' | 'warranty_recovery.oem_acknowledged'
  | 'warranty_recovery.under_assessment' | 'warranty_recovery.assessment_complete'
  | 'warranty_recovery.approved' | 'warranty_recovery.disputed'
  | 'warranty_recovery.recovery_pending' | 'warranty_recovery.recovered'
  | 'warranty_recovery.rejected' | 'warranty_recovery.withdrawn'
  | 'warranty_recovery.written_off' | 'warranty_recovery.sla_breached'
  // Wave 64 — Esums Permit-to-Work (PTW) / LOTO Authorisation & Isolation Control chain (OHSA 85/1993 s8 + Construction Regulations 2014 + Electrical/General Machinery Regulations + REIPPPP O&M safe-system-of-work; URGENT SLA; LIVE-WORK / ISOLATION-INTEGRITY signature: issue_permit crosses for EVERY tier when live or confined-space (else top tiers only); revoke_permit ALWAYS crosses; sla_breached crosses for top tiers; single-party write, actor_party issuing_authority/permit_holder derived from action)
  | 'permit_to_work.assessment_started' | 'permit_to_work.isolation_planned'
  | 'permit_to_work.isolation_verified' | 'permit_to_work.issued'
  | 'permit_to_work.work_started' | 'permit_to_work.suspended'
  | 'permit_to_work.resumed' | 'permit_to_work.work_completed'
  | 'permit_to_work.closed' | 'permit_to_work.rejected'
  | 'permit_to_work.revoked' | 'permit_to_work.withdrawn'
  | 'permit_to_work.sla_breached'
  // Wave 65 — Carbon ERPA (Emission Reduction Purchase Agreement) Forward Delivery & Make-Good chain (the commercial forward-sale on top of the carbon-credit lifecycle: buyer contracts a project's future reductions, seller delivers against a schedule, short delivery triggers make-good; INVERTED SLA; CORRESPONDING-ADJUSTMENT signature: verify_delivery crosses for EVERY tier when transfer is Article 6 (ITMO needing an NDC correction), else large tiers only; terminate + sla_breached cross for large tiers; single carbon-fund desk write, actor_party seller/buyer/registry from action, resolve_dispute & settle share .settled)
  | 'carbon_erpa.executed' | 'carbon_erpa.delivery_scheduled'
  | 'carbon_erpa.delivery_initiated' | 'carbon_erpa.delivery_verified'
  | 'carbon_erpa.shortfall_flagged' | 'carbon_erpa.make_good_pending'
  | 'carbon_erpa.settled' | 'carbon_erpa.completed'
  | 'carbon_erpa.disputed' | 'carbon_erpa.terminated'
  | 'carbon_erpa.withdrawn' | 'carbon_erpa.sla_breached'
  // ─── Wave 83: NERSA Consultation Notice & Public-Comment Period ──────────
  | 'consultation_notice.drafted' | 'consultation_notice.published'
  | 'consultation_notice.open_for_comment' | 'consultation_notice.comment_period_closed'
  | 'consultation_notice.hearing_scheduled' | 'consultation_notice.hearing_held'
  | 'consultation_notice.analysis' | 'consultation_notice.response_drafted'
  | 'consultation_notice.adopted' | 'consultation_notice.on_hold'
  | 'consultation_notice.withdrawn' | 'consultation_notice.cancelled'
  | 'consultation_notice.sla_breached'
  // ─── Wave 84: Grid Black-Start Capability Contracting & System-Restoration Drill ──
  | 'black_start.solicitation_issued' | 'black_start.bid_evaluation'
  | 'black_start.contract_awarded' | 'black_start.contract_executed'
  | 'black_start.drill_scheduled' | 'black_start.drill_in_progress'
  | 'black_start.drill_completed' | 'black_start.recertified'
  | 'black_start.drill_failed' | 'black_start.remediation_required'
  | 'black_start.contract_terminated' | 'black_start.sla_breached'
  // ─── Wave 85: Trader Settlement Fails Management & CSDR-style Buy-In/Sell-Out ──
  | 'settlement_fail.fail_recorded' | 'settlement_fail.extension_granted'
  | 'settlement_fail.penalty_accruing' | 'settlement_fail.buy_in_initiated'
  | 'settlement_fail.buy_in_executing' | 'settlement_fail.buy_in_settled'
  | 'settlement_fail.cash_compensation' | 'settlement_fail.closed_resolved'
  | 'settlement_fail.dispute_raised' | 'settlement_fail.force_majeure_suspended'
  | 'settlement_fail.written_off' | 'settlement_fail.sla_breached'
  // ─── Wave 86: Lender DSCR Monitoring & Cure (P6); LMA covenant test + SARB IFRS9 Stage2/3 trigger + Basel III. The COVERAGE-DEFENSE engine of the project-finance loan book: ratio computation → certify_clean OR watch OR breach → cure proposal/execute/validate → recovery OR lock_up OR acceleration to W45 OR waiver. Beats Mott MacDonald PFlex / Riverbed-PF / Modelware / FIS Sungard Reflect / Excel-based bank PF monitoring / KPMG-PwC SLL trackers via LIVE coverage battery (severity index, headroom-to-lockup months, cure runway days, equity-cure coverage ratio, DSRA coverage ratio with W77 hookup, forward DSCR, LLCR, PLCR, cross-default flag, urgency band) on every record and tier RE-DERIVED on every transition from the current DSCR. Tier RE-DERIVED: minor>=1.30 / standard>=1.20 / material>=1.00 / severe<1.00. URGENT SLA (lower DSCR = tighter every window). SIGNATURE COVERAGE-DEFENSE: declare_acceleration crosses regulator EVERY tier (sister of W45 write_off / W77 declare_breach / W68 declare_default — IFRS 9 Stage 3 trigger); waive_breach + enter_lock_up + sla_breached cross material+severe. Single lender-desk write {admin,lender}; actor_party lender/borrower/independent_engineer from action. ───
  | 'dscr_monitoring.data_collected' | 'dscr_monitoring.computed'
  | 'dscr_monitoring.certified_clean' | 'dscr_monitoring.watch'
  | 'dscr_monitoring.breach_recorded' | 'dscr_monitoring.cure_proposed'
  | 'dscr_monitoring.cure_in_progress' | 'dscr_monitoring.cure_validated'
  | 'dscr_monitoring.lock_up' | 'dscr_monitoring.accelerated'
  | 'dscr_monitoring.waived' | 'dscr_monitoring.sla_breached'
  // ─── Wave 87: Offtaker PPA Scheduled-Energy Nomination & Deviation Settlement (P6); the daily/monthly operational pulse of any PPA. Day-ahead nomination → confirmation → optional intra-day revision → gate closure → delivery → meter ingestion → reconciliation → SETTLEMENT at the deviation tariff. Excused branches catch force-majeure / curtailment; dispute branch crosses into NERSA s30. Beats Mott MacDonald PPA Manager / KPMG PPA Operations / Power Advocate PPA Monitor / Open Energi VPP / Schneider EcoStruxure Energy / SAP IS-U / Oracle Utilities CC&B via LIVE nomination-integrity battery (abs MWh deviation, abs %, signed, deviation value ZAR, predicted penalty ZAR with ×1.0/1.2/1.5/2.0 band ladder, capacity factor realized, forecast accuracy, weather-normalised residual, 3-period trend, SLA days remaining, urgency band) re-computed every fetch + tier RE-DERIVED on every transition from |deviation|% (minor<5%/standard<10%/material<20%/major≥20%). URGENT SLA (larger deviation = tighter window). SIGNATURE NOMINATION-INTEGRITY: raise_dispute crosses regulator EVERY tier (NERSA s30 — PPA disputes always reportable, sister of W66 lodge_appeal); excuse_period + settle_deviation + sla_breached cross material+major. Single offtaker-desk write {admin,offtaker}; actor_party offtaker/seller/system_operator/independent_meter from action. ───
  | 'ppa_nomination.da_nominated' | 'ppa_nomination.da_confirmed'
  | 'ppa_nomination.da_rejected' | 'ppa_nomination.id_revised'
  | 'ppa_nomination.delivery_in_progress' | 'ppa_nomination.delivery_complete'
  | 'ppa_nomination.meter_data_received' | 'ppa_nomination.reconciled'
  | 'ppa_nomination.dispute_raised' | 'ppa_nomination.deviation_settled'
  | 'ppa_nomination.excused' | 'ppa_nomination.cancelled'
  | 'ppa_nomination.sla_breached'
  // ─── Wave 88: Esums BESS State-of-Health Monitoring & Capacity-Augmentation (P6); contractual capacity guarantee lifecycle — baseline → monitoring → drift → assessment → augmentation_required → planned → in_progress → complete → recommissioned, with disputed branch + decommissioned terminal. Beats Powin Stack OS / Tesla Megapack OS / Fluence BMS / AES Advancion / Wärtsilä GEMS / Honeywell Experion BESS via LIVE health + augmentation-economics battery (SOH headroom, annualised fade rate, EFC, cycle-vs-calendar attribution, capacity shortfall MWh, augmentation CapEx ZAR, capacity-payment-at-risk ZAR, augmentation NPV ZAR, warranty recovery eligible, predicted decommission years, SLA days remaining, urgency band) + tier RE-DERIVED on every transition from current SOH vs floor (nominal>=floor+10 / watch>=floor+5 / material>=floor / critical<floor). URGENT SLA. SECURITY-OF-SUPPLY SIGNATURE: require_augmentation crosses regulator EVERY tier when capacity>=50 MW (NERSA Grid Code threshold), heavy tiers (material+critical) otherwise; decommission crosses EVERY tier (loss of grid capacity always reportable); raise_dispute + sla_breached cross heavy tiers. Single Esums-desk write {admin,support}; actor_party operator/oem/owner/regulator from action. ───
  | 'bess_soh.monitoring_activated' | 'bess_soh.drift_detected'
  | 'bess_soh.assessment_pending' | 'bess_soh.augmentation_required'
  | 'bess_soh.augmentation_planned' | 'bess_soh.works_started'
  | 'bess_soh.works_completed' | 'bess_soh.recommissioned'
  | 'bess_soh.dispute_raised' | 'bess_soh.dispute_resolved'
  | 'bess_soh.decommissioned' | 'bess_soh.cancelled'
  | 'bess_soh.sla_breached'
  // ─── Wave 89: OEM-Support Field Change Order / ECN Campaign Management (P6); OEM-pushed fleet-wide retrofit campaigns — draft → under_review → approved → population_identified → notification_sent → acknowledged → scheduling → in_progress → completed, with suspended↔in_progress loop, post-approval cancel, and pre-approval withdraw. Beats PTC Windchill ECM / Siemens Teamcenter Change Manager / Oracle Agile PLM / Arena PLM / Aras Innovator / Dassault Enovia / SAP PLM field-action / Tesla Megapack service campaigns / Vestas Online Service Bulletins / GE Vernova fleet upgrade campaigns via LIVE fleet-coverage + retrofit-economics battery (completion %, mean time to retrofit, predicted full coverage days, total campaign CapEx ZAR, warranty coverage %, fleet energy at risk MW, acknowledgement %, judicial-review-risk score, SLA days remaining, urgency band) + tier RE-DERIVED on every transition from change_class (mandatory_safety / mandatory_performance / recommended / optional). URGENT SLA. FLEET-PROPAGATION SIGNATURE: approve_campaign crosses regulator EVERY tier when mandatory_safety (NRCS+SANS); send_notification crosses EVERY tier when affected_capacity_mw>=50 MW (NERSA Grid Code) or mandatory tiers otherwise; complete_campaign crosses EVERY tier when mandatory_safety; suspend_campaign crosses EVERY tier when mandatory_safety; cancel_campaign crosses EVERY tier ALWAYS (post-approval cancellation hard line); withdraw_campaign crosses EVERY tier when mandatory_safety; sla_breached mandatory tiers only. Single OEM-Support desk write {admin,support}; actor_party oem/operator/owner/regulator from action. ───
  | 'oem_fco.submitted' | 'oem_fco.approved'
  | 'oem_fco.population_identified' | 'oem_fco.notification_sent'
  | 'oem_fco.acknowledged' | 'oem_fco.scheduling_opened'
  | 'oem_fco.rollout_started' | 'oem_fco.completed'
  | 'oem_fco.suspended' | 'oem_fco.resumed'
  | 'oem_fco.cancelled' | 'oem_fco.withdrawn'
  | 'oem_fco.sla_breached'
  // ─── Wave 90: Trader JIBAR Cessation Benchmark Transition & Fallback (P6); per-contract repapering of IBOR-referencing trades (IRS / basis swap / FRA / syndicated loan / FRN / structured note / cross-currency swap) under SARB MPG JIBAR→ZARONIA Reform Plan + ISDA 2020 IBOR Fallbacks Protocol + FSCA Conduct Standard 1/2020 + FMA Ch.X + JSE-SRL Schedule SC + IFRS 9 Phase 2 — inventoried → impact_assessed → classified → notified → responded → amendment_drafted → amendment_executed → vt_settled → transitioned_clean, with disputed loop (→ classified on resolve), on_hold loop (→ classified on resume), terminate_legacy terminal, and pre-execution cancel terminal. Beats Bloomberg AIBOR/IBOR Transition / ICE Benchmark Administration fallback service / ISDA Protocol adherence tracker / LCH SwapAgent / CME LIBOR Conversion Service / Murex MX.3 IBOR Transition / Calypso Benchmark Reform / SoFi Reference Rate Transition Manager via LIVE transition-integrity battery (PV01 ZAR / value-transfer ZAR / fallback basis spread bps / days_to_cessation / compounded ZARONIA rate / counterparty response % / protocol adherence flag / dispute concentration / predicted resolution days / hedge-effectiveness flag / urgency band cessation-aware) + tier RE-DERIVED on every transition from absolute notional_zar with FLOOR-AT-MATERIAL when interbank OR <30d to cessation. URGENT SLA (larger notional = tighter; systemic interbank cessation cliff faces tightest). TRANSITION-INTEGRITY SIGNATURE: terminate_legacy crosses regulator EVERY tier ALWAYS (SARB MPG transition-failure reporting hard line); complete_transition crosses material+systemic (SARB MPG completion ledger); raise_dispute crosses systemic only (ISDA Determinations Committee); sla_breached crosses material+systemic. Single trader-desk write {admin,trader}; actor_party transition_desk/counterparty_credit/docs_legal/risk_validation from action. ───
  | 'benchmark_transition.inventoried' | 'benchmark_transition.impact_assessed'
  | 'benchmark_transition.classified' | 'benchmark_transition.notified'
  | 'benchmark_transition.responded' | 'benchmark_transition.amendment_drafted'
  | 'benchmark_transition.amendment_executed' | 'benchmark_transition.vt_settled'
  | 'benchmark_transition.transitioned_clean' | 'benchmark_transition.disputed'
  | 'benchmark_transition.dispute_resolved' | 'benchmark_transition.on_hold'
  | 'benchmark_transition.resumed' | 'benchmark_transition.terminated_legacy'
  | 'benchmark_transition.cancelled' | 'benchmark_transition.sla_breached'
  // Wave 66 — Regulator Complaints & Dispute Resolution chain (NERSA as the quasi-judicial dispute forum under ERA 4/2006 s30 + NER Act 40/2004 + NERSA Complaints Procedures; REACTIVE external-party grievance adjudication, distinct from W31 internal-intake disposition and W40 proactive inspection; lodged→admissibility→referred_to_licensee→[settle | investigation→mediation→hearing→ruling→remedy_monitoring→resolved] + dismiss/appeal/withdraw; URGENT SLA (larger affected population = tighter); single regulator-owned write {admin,regulator}, actor_party complainant/respondent/adjudicator from action; SIGNATURE lodge_appeal crosses for EVERY tier (judicial review always material), issue_ruling crosses major+systemic, dismiss crosses systemic only, sla_breached crosses major+systemic; settle_at_licensee & confirm_compliance share .resolved)
  | 'regulator_complaint.admissibility_review' | 'regulator_complaint.referred'
  | 'regulator_complaint.escalated' | 'regulator_complaint.mediating'
  | 'regulator_complaint.hearing_convened' | 'regulator_complaint.ruling_issued'
  | 'regulator_complaint.remedy_monitoring' | 'regulator_complaint.resolved'
  | 'regulator_complaint.dismissed' | 'regulator_complaint.appealed'
  | 'regulator_complaint.withdrawn' | 'regulator_complaint.sla_breached'
  // Wave 67 — Grid Code Compliance Monitoring & Non-Conformance chain (the SO/TSO (NTCSA) monitors each connected facility's ongoing TECHNICAL conformance with the SA Grid Code + the Grid Connection Code for RPPs + NRS 048-2/4, and manages a non-conformance through a formal remediation lifecycle: monitoring→non_conformance_raised→under_assessment→corrective_action_required→cap_submitted→cap_approved→remediation_in_progress→compliance_retest→compliant_closed, with a CAP-revise loop (reject_cap), an interim operating_restriction branch and a disconnection_issued terminal; URGENT SLA (more severe tier = tighter); 5 tiers by non-compliant capacity MW with a breach-class floor (fault_ride_through/frequency_response/protection_coordination→serious, reactive_power/voltage_regulation→material); SIGNATURE escalate_disconnection crosses for EVERY tier (disconnecting a connected licensed facility is always notifiable), impose_restriction + sla_breached cross for large tiers (serious+critical); split write SO/TSO operator drives the machinery, facility submits the CAP & performs remediation, actor_party tags the side; reject_cap reuses .corrective_action_required event)
  | 'grid_code_compliance.non_conformance_raised' | 'grid_code_compliance.under_assessment'
  | 'grid_code_compliance.corrective_action_required' | 'grid_code_compliance.cap_submitted'
  | 'grid_code_compliance.cap_approved' | 'grid_code_compliance.remediation_in_progress'
  | 'grid_code_compliance.compliance_retest' | 'grid_code_compliance.compliant_closed'
  | 'grid_code_compliance.operating_restriction' | 'grid_code_compliance.disconnection_issued'
  | 'grid_code_compliance.withdrawn' | 'grid_code_compliance.sla_breached'
  // Wave 68 — Counterparty Margin Call & Default Management chain (the clearing/risk desk manages each participant's counterparty-credit & collateral relationship per FMA 2012 + FSCA Conduct Standards + CPMI-IOSCO PFMI Principles 4/5/6/13: limit_active→exposure_warning→margin_call_issued→collateral_received with a cure_breach loop back to limit_active, an escalation branch via position_restriction/cure_period, and a default waterfall {cure_period,position_restriction}→default_declared→close_out→default_fund_draw→recovered|written_off; 5 tiers by exposure-at-risk ZAR with a SIFI floor at major; URGENT SLA (larger exposure = tighter); SIGNATURE declare_default crosses for EVERY tier (declaring a participant default is always notifiable to the FSCA/Prudential Authority), draw_default_fund + write_off + sla_breached cross for high tiers (major+systemic); single clearing-desk write, partyForAction tags clearing_house vs member for the audit trail)
  | 'counterparty_margin.exposure_warning' | 'counterparty_margin.margin_call_issued'
  | 'counterparty_margin.collateral_received' | 'counterparty_margin.limit_active'
  | 'counterparty_margin.position_restriction' | 'counterparty_margin.cure_period'
  | 'counterparty_margin.default_declared' | 'counterparty_margin.close_out'
  | 'counterparty_margin.default_fund_draw' | 'counterparty_margin.recovered'
  | 'counterparty_margin.written_off' | 'counterparty_margin.withdrawn'
  | 'counterparty_margin.sla_breached'
  // ─── Wave 69 — Security / Collateral Perfection & Registration chain ───
  | 'security_perfection.documentation_pending' | 'security_perfection.executed'
  | 'security_perfection.lodged_for_registration' | 'security_perfection.registered'
  | 'security_perfection.perfection_review' | 'security_perfection.perfected'
  | 'security_perfection.defective' | 'security_perfection.perfection_overdue'
  | 'security_perfection.released' | 'security_perfection.lapsed'
  | 'security_perfection.withdrawn' | 'security_perfection.sla_breached'
  // ─── Wave 70 — REC / Guarantee-of-Origin Certificate Lifecycle chain ───
  | 'rec_lifecycle.eligibility_review' | 'rec_lifecycle.issued'
  | 'rec_lifecycle.listed_for_transfer' | 'rec_lifecycle.transferred'
  | 'rec_lifecycle.allocated' | 'rec_lifecycle.retired'
  | 'rec_lifecycle.cancelled' | 'rec_lifecycle.rejected'
  | 'rec_lifecycle.disputed' | 'rec_lifecycle.clawed_back'
  | 'rec_lifecycle.expired' | 'rec_lifecycle.sla_breached'
  // ─── Wave 71 — Esums Predictive Asset Health & Prognostics chain ───────
  | 'asset_prognostic.triaged' | 'asset_prognostic.dismissed'
  | 'asset_prognostic.auto_suppressed' | 'asset_prognostic.diagnosed'
  | 'asset_prognostic.action_planned' | 'asset_prognostic.wo_raised'
  | 'asset_prognostic.monitoring' | 'asset_prognostic.resolved'
  | 'asset_prognostic.escalated' | 'asset_prognostic.confirmed_failure'
  | 'asset_prognostic.expired' | 'asset_prognostic.sla_breached'
  // ─── Wave 72 — OEM-Support Spare-Parts Provisioning & Replenishment chain (service-parts-planning: predictive (W71 RUL) demand → requisition → PO → receive → incoming-QA → stock → reserve → issue; URGENT SLA; AVAILABILITY-RISK signature: flag_backorder crosses when (vital AND HIGH) OR catastrophic, cancel_provisioning crosses when (vital AND HIGH), sla_breached crosses HIGH tiers; single-party {admin,support} write, actor_party planner/buyer/warehouse/supplier from action; confirm_shipment & expedite_backorder share .in_transit) ───
  | 'spare_parts_provisioning.requisition_raised' | 'spare_parts_provisioning.requisition_approved'
  | 'spare_parts_provisioning.po_issued' | 'spare_parts_provisioning.backordered'
  | 'spare_parts_provisioning.in_transit' | 'spare_parts_provisioning.received'
  | 'spare_parts_provisioning.stocked' | 'spare_parts_provisioning.reserved'
  | 'spare_parts_provisioning.issued' | 'spare_parts_provisioning.returned'
  | 'spare_parts_provisioning.cancelled' | 'spare_parts_provisioning.sla_breached'
  // ─── Wave 73 — Carbon PoA / Programme-of-Activities Sub-Project (CPA) Inclusion & Conformance chain (the ONE-TO-MANY operational layer of the carbon portfolio: a registered Programme of Activities screens individual Component Project Activities (CPAs) in over its lifetime, gated on a host-country Letter of Approval, monitored/verified for ongoing conformance with DELISTING if they stop conforming; beats CDM PoA / GS4GG / Verra grouped projects via automated eligibility scoring, real-time double-counting/geo-overlap guard, programme-cap headroom, host-country LoA gating, SLA-driven inclusion turnaround; 12-state P6 cpa_proposed→eligibility_screening→methodology_check→loa_pending→inclusion_review→included→monitoring→verified with a verified↔monitoring loop + rejected/excluded/withdrawn/completed terminals; INVERTED SLA (larger CPA = longer window); DELISTING signature: exclude_cpa crosses for EVERY tier, approve_inclusion crosses when corresponding-adjustment required else large+mega, reject_cpa + sla_breached cross large+mega; single carbon-fund desk write {admin,carbon_fund}, actor_party proponent/coordinating_entity/dna/vvb from action; begin_monitoring + continue_monitoring share .monitoring) ───
  | 'carbon_poa.eligibility_screening' | 'carbon_poa.methodology_check'
  | 'carbon_poa.loa_pending' | 'carbon_poa.inclusion_review'
  | 'carbon_poa.included' | 'carbon_poa.monitoring'
  | 'carbon_poa.verified' | 'carbon_poa.rejected'
  | 'carbon_poa.excluded' | 'carbon_poa.withdrawn'
  | 'carbon_poa.completed' | 'carbon_poa.sla_breached'
  // ─── Wave 74 — Regulator NERSA Levy Assessment & Collection chain (NERSA recovering its own running costs from the industries it regulates: an annual levy under s5B of the National Energy Regulator Act 40/2004 + fees under ERA 4/2006 s10, assessed on a declared base (turnover / throughput volume / fixed schedule) across electricity/piped-gas/petroleum-pipeline; DISTINCT from W43 tariff-determination by SUBJECT — W43 sets what a licensee CHARGES its customers, W74 sets what it OWES the regulator; the financial counterpart to the licensing chains W33/W49/W57; 12-state P6 levy_assessed→assessment_review→invoiced→payment_pending→(partially_paid…)→settled, objection branch invoiced→objection_review→payment_pending, arrears/dunning branch payment_pending|partially_paid→in_arrears→final_demand→enforcement→settled|written_off, withdraw before payment; URGENT SLA (larger assessed levy = tighter window); SIGNATURE escalate_enforcement crosses for EVERY tier (licence good-standing at risk) + write_off crosses for EVERY tier (fiscal write-off of public revenue), issue_final_demand + sla_breached cross for large+major; single regulator-owned write {admin,regulator}, actor_party regulator/licensee from action; resolve_objection + confirm_payable share .payment_pending) ───
  | 'regulator_levy.assessment_review' | 'regulator_levy.invoiced'
  | 'regulator_levy.objection_review' | 'regulator_levy.payment_pending'
  | 'regulator_levy.partially_paid' | 'regulator_levy.in_arrears'
  | 'regulator_levy.final_demand' | 'regulator_levy.enforcement'
  | 'regulator_levy.settled' | 'regulator_levy.written_off'
  | 'regulator_levy.withdrawn' | 'regulator_levy.sla_breached'
  // ─── Wave 75 — Grid Connection Energization & Commissioning Hold-Point Gate (the PHYSICAL go-live gate for a new generator: after winning scarce capacity (W58) and signing its Grid Connection Agreement (W28), a plant must be COMMISSIONED and ENERGIZED through a sequence of witnessed SA-Grid-Code / NTCSA hold-points before it can sell a MWh — programme agreed → pre-energization safety inspection → connection assets energized → cold commissioning (protection/SCADA/telemetry) → first synchronization → trial-operation run under load → grid-code compliance tests (FRT/reactive/frequency) → COD certificate; a failed hold-point SUSPENDS until remediated, an abandoned project withdraws; 12-state P6 connection_ready→program_review→program_approved→pre_energization_inspection→energization_authorized→cold_commissioning→synchronized→trial_operation→compliance_testing→commercial_operation + commissioning_suspended (resume→program_approved) + connection_withdrawn; tiers by connection capacity MW embedded<1/distribution<10/sub_transmission<50/transmission<200/bulk>=200; INVERTED SLA (larger connection = longer windows); SIGNATURE COD-driven + POSITIVE — issue_cod crosses for EVERY tier (new generation to commercial operation is always notifiable — the mirror of W67 disconnection where the FAILURE terminal always reports), authorize_energization + suspend_commissioning + sla_breached cross for large tiers transmission+bulk; split write operator(SO){admin,support,grid_operator}↔facility(IPP){admin,ipp_developer}; DISTINCT from W58 capacity-queue / W28 GCA-agreement / W67 ongoing-compliance; resume_commissioning shares .program_approved) ───
  | 'connection_energization.program_review' | 'connection_energization.program_approved'
  | 'connection_energization.pre_energization_inspection' | 'connection_energization.energization_authorized'
  | 'connection_energization.cold_commissioning' | 'connection_energization.synchronized'
  | 'connection_energization.trial_operation' | 'connection_energization.compliance_testing'
  | 'connection_energization.commercial_operation' | 'connection_energization.commissioning_suspended'
  | 'connection_energization.connection_withdrawn' | 'connection_energization.sla_breached'
  // ─── Wave 76 — Trade Allocation, Give-Up & Confirmation/Affirmation (the post-execution institutional trade-processing leg: an executed block trade is ALLOCATED across client sub-accounts, optionally GIVEN UP to a clearing broker who ACCEPTS it, a CONFIRMATION is issued, the counterparty AFFIRMS it, central matching reconciles both sides DTCC/Omgeo-CTM-style, settlement is instructed against standing settlement instructions (SSI) and the trade SETTLES at the CSD; any discrepancy is a BREAK flagged with a structured reason code and resolved; 12-state P6 executed→allocation_pending→allocated→give_up_pending→give_up_accepted→confirmation_issued→affirmed→matched→settlement_instructed→settled + break_review (resolve→confirmation_issued) + cancelled, self-cleared trades skip give-up via allocated→confirmation_issued; tiers by trade notional ZAR micro<1m/small<10m/medium<50m/large<250m/block>=250m; URGENT SLA (larger notional = tighter same-day-affirmation windows); SIGNATURE BREAK-driven — flag_break crosses for EVERY tier (under CSDR-style settlement discipline every break/fail is notifiable — the mirror of W68 declare_default / W67 escalate_disconnection), cancel_trade + sla_breached cross for large+block; single write {admin,trader} with party-from-action front_office/middle_office/counterparty; DISTINCT from W44 trade-reporting / W3 venue-settlement / W68 counterparty-margin; resolve_break shares .confirmation_issued) ───
  | 'trade_allocation.allocation_pending' | 'trade_allocation.allocated'
  | 'trade_allocation.give_up_pending' | 'trade_allocation.give_up_accepted'
  | 'trade_allocation.confirmation_issued' | 'trade_allocation.affirmed'
  | 'trade_allocation.matched' | 'trade_allocation.settlement_instructed'
  | 'trade_allocation.settled' | 'trade_allocation.break_review'
  | 'trade_allocation.cancelled' | 'trade_allocation.sla_breached'
  // ─── Wave 77 — Lender reserve-account (DSRA/MRA) funding/cure/release ───
  | 'reserve_account.funding_scheduled' | 'reserve_account.funding_in_progress'
  | 'reserve_account.funded' | 'reserve_account.shortfall_flagged'
  | 'reserve_account.cure_pending' | 'reserve_account.drawdown_authorized'
  | 'reserve_account.drawn' | 'reserve_account.release_requested'
  | 'reserve_account.released' | 'reserve_account.breached'
  | 'reserve_account.cancelled' | 'reserve_account.sla_breached'
  // ─── W78 PPA Change-in-Law / Qualifying-Change relief chain ────────────
  | 'ppa_change_in_law.eligibility_review' | 'ppa_change_in_law.impact_assessment'
  | 'ppa_change_in_law.claim_submitted' | 'ppa_change_in_law.counterparty_review'
  | 'ppa_change_in_law.negotiation' | 'ppa_change_in_law.determination_pending'
  | 'ppa_change_in_law.in_arbitration' | 'ppa_change_in_law.relief_granted'
  | 'ppa_change_in_law.implemented' | 'ppa_change_in_law.rejected'
  | 'ppa_change_in_law.withdrawn' | 'ppa_change_in_law.sla_breached'
  // ─── W79 Esums Generation Revenue Assurance & Meter Reconciliation chain ─
  | 'generation_revenue_assurance.data_ingested' | 'generation_revenue_assurance.reconciled'
  | 'generation_revenue_assurance.variance_flagged' | 'generation_revenue_assurance.investigating'
  | 'generation_revenue_assurance.classified' | 'generation_revenue_assurance.recovery_pending'
  | 'generation_revenue_assurance.in_dispute' | 'generation_revenue_assurance.recovered'
  | 'generation_revenue_assurance.closed_clean' | 'generation_revenue_assurance.written_off'
  | 'generation_revenue_assurance.cancelled' | 'generation_revenue_assurance.sla_breached'
  // ─── Wave 80 — OEM-Support Service-Contract / AMC Renewal, Entitlement & Coverage chain (the COMMERCIAL GATE under every other OEM-Support chain: the contract that decides whether a deployed asset gets manufacturer support at all, at what response-time SLA entitlement, within what parts/visit allowances; quote → activate → annual renewal loop → suspension/grace/expiry; beats ServiceMax / SAP Service Cloud / Salesforce FS entitlements / IFS by live-wiring the entitlement as a real coverage gate, making renewal urgency COVERAGE-GAP-aware, and crossing a lapse on important coverage to the regulator as security-of-supply; 12-state P6 draft→quoted→pending_activation→active→renewal_due→renewal_quoted→negotiating→renewed with grace (→in_grace→expired) + suspension (active→suspended→active|expired|cancelled) branches; coverage tier basic/standard/premium/mission_critical drives the response-SLA entitlement + renewal-window urgency + reportability; URGENT SLA (higher tier = tighter renewal windows, strictly decreasing); COVERAGE-GAP signature: expire_coverage crosses for HIGH tiers, suspend_coverage + cancel_contract cross for mission_critical only, sla_breached crosses HIGH; single-party {admin,support} write, actor_party account_manager/service_desk/finance from action; activate_coverage + reinstate_coverage share .active) ───
  | 'service_contract.quoted' | 'service_contract.pending_activation'
  | 'service_contract.active' | 'service_contract.renewal_due'
  | 'service_contract.renewal_quoted' | 'service_contract.negotiating'
  | 'service_contract.in_grace' | 'service_contract.renewed'
  | 'service_contract.suspended' | 'service_contract.expired'
  | 'service_contract.cancelled' | 'service_contract.sla_breached'
  // ─── Wave 81 — IPP Project Change-Order / Variation Control & EVM ──────
  | 'project_change_order.submitted' | 'project_change_order.screening'
  | 'project_change_order.impact_assessment' | 'project_change_order.pending_approval'
  | 'project_change_order.approved' | 'project_change_order.incorporated'
  | 'project_change_order.deferred' | 'project_change_order.disputed'
  | 'project_change_order.rejected' | 'project_change_order.withdrawn'
  | 'project_change_order.cancelled' | 'project_change_order.sla_breached'
  // ─── Wave 82 — Carbon Credit Issuance & Serialization chain (the MINTING step of the carbon-credit lifecycle: after a monitoring period has been verified (W11) and the project is in good standing (W37/W56), the registry SERIALIZES the verified reductions into a unique serial-number block and credits the proponent's holding account; beats Verra Registry on APX / Gold Standard Impact Registry / S&P Global Environmental Registry / Cercarbono / Puro.earth — all linear manual-integrity-check workflows — via live calculated integrity guards on every record: serial-block transparency, buffer-pool maths, project+vintage cumulative headroom, double-issuance/over-issuance flags, Article-6 corresponding-adjustment binding; 12-state P6 requested→screening→verification_check→serialization→pending_registry→issued (clean path) with on_hold (resume→screening), returned (resubmit→screening), disputed (resolve→serialization), rejected/withdrawn/cancelled terminals; tiers by REQUESTED tCO2e minor<10k/moderate<100k/major<500k/mega>=500k with Article-6 floor at major; INVERTED SLA (larger volume = longer windows = deeper diligence); INTEGRITY signature: raise_dispute crosses regulator for EVERY tier (a serial/quantum dispute is always reportable), confirm_issuance crosses EVERY tier when CA-required else major+mega only, reject + sla_breached cross major+mega only; single carbon-fund desk write {admin,carbon_fund}, actor_party proponent/registry/vvb/dna from action; resume + resubmit both share .screening, resolve_dispute shares .serialization) ───
  | 'carbon_issuance.screening' | 'carbon_issuance.verification_check'
  | 'carbon_issuance.serialization' | 'carbon_issuance.pending_registry'
  | 'carbon_issuance.issued' | 'carbon_issuance.on_hold'
  | 'carbon_issuance.returned' | 'carbon_issuance.disputed'
  | 'carbon_issuance.rejected' | 'carbon_issuance.withdrawn'
  | 'carbon_issuance.cancelled' | 'carbon_issuance.sla_breached'
  // ─── Wave 91 — ICVCM CCP-eligibility Assessment & Label Lifecycle chain (the QUALITY-LABEL "rating" layer of the carbon-credit market: independent integrity assessment that awards the CCP-eligible (Core Carbon Principles) label — the market's "investment-grade" mark that unlocks premium pricing AND CORSIA Phase-2 eligibility (mandatory for airline retirements from 2027); entirely orthogonal to issuance (W82) / retirement (W17) / MRV (W11); beats Sylvera / BeZero Carbon / Calyx Global / Renoster / Pachama — all opaque proprietary rating systems that lag the market — via LIVE calculated CCP-criteria scoring on every record: 10-criterion aggregate, weakest-criterion identification, CORSIA Phase-2 eligibility derivation, market premium-pricing uplift, equivalent grade mapping to major rating agencies; 12-state P6 requested→screening→eligibility_check→assessment_in_progress→vvb_review→ccp_decision_pending→ccp_label_granted (clean path) with on_hold (resume→screening), returned (resubmit→screening), disputed (resolve→vvb_review), ccp_label_denied/withdrawn terminals; tiers by ASSESSED ANNUAL tCO2e minor<100k/moderate<500k/major<2M/mega>=2M with high-integrity-risk-sector floor at major (REDD+/jurisdictional/avoidance); INVERTED SLA (larger volume = longer windows = deeper rating diligence); INTEGRITY-MARK signature: deny_ccp_label crosses regulator for EVERY tier (public market-rejection signal), grant_ccp_label crosses EVERY tier when CONDITIONAL else major+mega only, raise_dispute + sla_breached cross major+mega only; single carbon-fund desk write {admin,carbon_fund}, actor_party proponent/icvcm/vvb/quality_assessor from action; resume + resubmit both share .screening, resolve_dispute shares .vvb_review) ───
  | 'ccp_assessment.screening' | 'ccp_assessment.eligibility_check'
  | 'ccp_assessment.assessment_in_progress' | 'ccp_assessment.vvb_review'
  | 'ccp_assessment.ccp_decision_pending' | 'ccp_assessment.ccp_label_granted'
  | 'ccp_assessment.ccp_label_denied' | 'ccp_assessment.on_hold'
  | 'ccp_assessment.returned' | 'ccp_assessment.disputed'
  | 'ccp_assessment.withdrawn' | 'ccp_assessment.sla_breached'
  // ─── Wave 92 — IPP Project Risk Register & Quantitative Schedule-Risk Analysis (P6 SRA: the PROJECT-RISK-MANAGEMENT core of a best-in-class IPP projects system — fills the gap every real capital project relies on next, QUANTIFYING risk via probability × impact, EMV, triangular Monte-Carlo cost & schedule risk analysis, residual EMV after planned response, contingency drawdown vs project reserve, and REIPPPP bid-envelope breach %; beats Acumen Fuse Risk / Primavera Risk Analysis (PRA) / Safran Risk / Palisade @Risk / Crystal Ball / Deltek Acumen Risk / Riskonnect / Predict! / Synergi Life / Active Risk Manager — all treat the risk register as a static spreadsheet disconnected from EVM and the bid envelope — via LIVE-scored P50/P80 EMV battery + residual EMV + contingency drawdown + bid-envelope-breach % on every fetch; 12-state P6 identified→assessed→quantified→response_planned→response_active→monitoring→closed (clean) with realized (event occurred), escalated (re-analyze), accepted (sponsor as-is), withdrawn/cancelled terminals; tier EMV-DERIVED on every transition probability_pct × |worst_case_zar| low<R500k/moderate<R5m/high<R50m/critical≥R50m, floor-at-high for risk_class IN (force_majeure, regulatory_change, strategic); INVERTED SLA (larger EMV = longer windows = deeper Monte-Carlo + board review + external-advisor consultation); REALIZATION-driven signature: realize_risk + risk_class IN (force_majeure, regulatory_change) crosses regulator EVERY tier (W92 SIGNATURE hard line), realize_risk on other classes crosses high+critical, escalate crosses high+critical, accept_risk crosses critical only (governance event), close_risk crosses critical+realized only (post-event close-out), sla_breached crosses high+critical only; single project-owner write {admin,ipp,ipp_developer,wind}, actor_party project_manager/risk_owner/project_controls/sponsor from action ───
  | 'project_risk.identified' | 'project_risk.assessed'
  | 'project_risk.quantified' | 'project_risk.response_planned'
  | 'project_risk.response_active' | 'project_risk.monitoring'
  | 'project_risk.realized' | 'project_risk.closed'
  | 'project_risk.accepted' | 'project_risk.escalated'
  | 'project_risk.withdrawn' | 'project_risk.cancelled'
  | 'project_risk.sla_breached'
  // ─── Wave 93 — NERSA ERA s35 Enforcement Actions & Administrative Penalties (the ENFORCEMENT-TEETH layer of a best-in-class regulator stack; downstream of W5 inbox + W31 disposition + W40 compliance-inspection findings: formal administrative-penalty proceedings under ERA s35 — charge sheet → audi alteram partem (representations) → optional oral hearing → Council determination → penalty notice → recovery; beats FERC Office of Enforcement / Ofgem provisional+final penalty notice / Bundesnetzagentur Bußgeldverfahren / CRE CoRDiS / AER civil-penalty undertaking / ACER / SEC ALJ / SARS TAA Ch15 — most run on spreadsheets and miss procedural windows — via LIVE AUDI-WINDOW COMPLIANCE battery (PAJA s4 + ERA s35(3) 21-day minimum), PROCEDURAL-IRREGULARITY flag on under-21-day windows or denied hearing without reasoned refusal, ERA s35 R1m/offence cap auto-enforced with offence-count stacking, prescribed-rate interest (15.5% Prescribed Rate of Interest Act 55/1975) accruing from due date, REPEAT-OFFENDER score raising floor-at-severe; 12-state P6 case_opened→allegations_drafted→allegations_served→representations_period→(hearing_held optional)→determination→penalty_imposed→paid (clean) with dismissed (no contravention), appealed (Tribunal track), enforced_via_court (writ/sheriff/garnishee/contempt), withdrawn terminals; tier RE-DERIVED on every transition from proposed_penalty_total minor<R100k/standard R100k-500k/material R500k-1m/severe≥R1m with floor-at-severe for safety_violation / repeat_offender / systemic_market_abuse classes; INVERTED SLA — audi alteram partem strengthens with magnitude (21d minor / 60d severe per s35(3) + PAJA s4); DETERMINATION-driven signature: impose_penalty crosses regulator EVERY tier (W93 SIGNATURE — public-register transparency obligation), initiate_enforcement crosses EVERY tier (court-system signal), lodge_appeal crosses EVERY tier (Tribunal signal), make_determination crosses every tier on severe + material+ otherwise when liable, serve_allegations crosses EVERY tier on floor-at-severe class, dismiss + withdraw cross material+severe (governance), sla_breached crosses material+severe (judicial-review risk); single regulator-side write {admin,regulator}, actor_party enforcement_officer/panel_chair/council/sheriff from action — read platform-wide so respondent can see own case ───
  | 'enforcement_action.case_opened' | 'enforcement_action.allegations_drafted'
  | 'enforcement_action.allegations_served' | 'enforcement_action.representations_period'
  | 'enforcement_action.hearing_held' | 'enforcement_action.determination'
  | 'enforcement_action.penalty_imposed' | 'enforcement_action.paid'
  | 'enforcement_action.appealed' | 'enforcement_action.enforced_via_court'
  | 'enforcement_action.dismissed' | 'enforcement_action.withdrawn'
  | 'enforcement_action.sla_breached'
  // ─── Wave 106 — NERSA Section 35 Administrative Enforcement Action & Fine Imposition (10th Regulator chain; the formal s35 state-machine downstream of W40 inspection + W66 complaint; coexists with W93 admin-penalty layer; full lifecycle: NOTICE → RESPONSE → ADJUDICATION → SANCTION (fine / licence suspension / licence revocation) → APPEAL → settled; INVERTED SLA — PAJA s5 procedural fairness needs more time at higher tiers; signature crossings: impose_sanction EVERY tier when licence_revocation_proposed=TRUE, commence_enforcement EVERY tier on strategic + criminal_intelligence, mark_settled material+strategic on significant sanctions, sla_breached material+strategic; write {admin,regulator}, actor_party derived from action) ───
  | 'enforcement_action.triggered' | 'enforcement_action.notice_drafted'
  | 'enforcement_action.notice_issued' | 'enforcement_action.respondent_acknowledged'
  | 'enforcement_action.response_received' | 'enforcement_action.adjudication_in_progress'
  | 'enforcement_action.adjudicated' | 'enforcement_action.sanction_imposed'
  | 'enforcement_action.appeal_window_open' | 'enforcement_action.re_adjudicated'
  | 'enforcement_action.enforcement_in_progress' | 'enforcement_action.settled'
  | 'enforcement_action.archived' | 'enforcement_action.cancelled'
  // ─── Wave 94 — NTCSA Renewable-Energy-Zone (REZ) Capacity Allocation & Competitive Auction (the COMPETITIVE-ZONAL-ALLOCATION layer of a best-in-class system-operator stack; W58 grid-capacity-allocation gives the generic FCFS queue, W28 GCA the physical connection agreement, W75 connection-energization the energization gate — W94 inserts the COMPETITIVE ZONAL AUCTION in between: announcement → application → compliance → shortlist → multi-criteria scoring → award → financial-close → construction → commercial-operation; beats AEMO REZ / NYISO TPP / CAISO TPP / ERCOT CREZ / EU TYNDP / ENTSO-E TYNDP / NGESO Holistic Network Design / Hydro Quebec MRC — most run REZ auctions on spreadsheets and never recycle forfeit MW — via LIVE-scored ZONE-HEADROOM battery (configured ceiling vs allocated-to-date MW), multi-criteria WEIGHTED-SCORE (price 0.50 + B-BBEE 0.20 + ED 0.15 + local-content 0.15 per the DMRE 40%-local-content REIPPPP rule), COMPETITION-RATIO from applications-per-lot, MILESTONE-COMPLIANCE % across awarded MW, FORFEIT-RATE per zone (failed milestones recycled back), PREDICTED-OPERATION-DATE rolling forward from current state; 12-state P6 announcement_published→application_submitted→compliance_check→shortlisted→evaluation_complete→award_proposed→capacity_awarded→financial_close_met→construction_in_progress→in_operation (terminal) with rejected (SO denial at compliance/evaluation/award), forfeit (milestone failure recycled), withdrawn terminals; tier MW-MAGNITUDE-DERIVED on every transition from awarded_capacity_mw fallback requested_capacity_mw — minor<50MW / standard 50-250MW / material 250-500MW / mega ≥500MW with FLOOR-AT-MEGA for allocation_class IN (priority_zone, constraint_relief_zone, jet_program_zone); INVERTED SLA — multi-criteria diligence strengthens with magnitude per NTCSA Rules 2024 (30d compliance for sub-100MW; mega 120d; construction milestone caps 3yr); AWARD/FORFEIT-driven SIGNATURE: award_capacity crosses regulator EVERY tier (W94 SIGNATURE — public capacity-allocation register; sister of W45 write_off / W77 declare_breach / W68 declare_default / W86 declare_acceleration / W89 cancel_campaign / W90 terminate_legacy / W91 deny_ccp_label / W92 realize_risk / W93 impose_penalty), forfeit_allocation crosses regulator EVERY tier (security-of-supply public signal — capacity recycled), reject_application crosses material+mega (governance), complete_evaluation crosses mega only (multi-criteria public scrutiny), confirm_operation crosses mega only (security-of-supply milestone), sla_breached crosses material+mega (procedural-window miss risk); single SO-side write {admin,grid_operator}, actor_party compliance_officer/evaluation_panel/council/system_operator from action — applicant reads own case via tenant scoping but cannot write ───
  | 'rez_capacity.announcement_published' | 'rez_capacity.application_submitted'
  | 'rez_capacity.compliance_check' | 'rez_capacity.shortlisted'
  | 'rez_capacity.evaluation_complete' | 'rez_capacity.award_proposed'
  | 'rez_capacity.capacity_awarded' | 'rez_capacity.financial_close_met'
  | 'rez_capacity.construction_in_progress' | 'rez_capacity.in_operation'
  | 'rez_capacity.rejected' | 'rez_capacity.forfeit'
  | 'rez_capacity.withdrawn' | 'rez_capacity.sla_breached'
  // ─── Wave 95 — Sustainability-Linked Loan (SLL) KPI Compliance & Margin Ratchet (the ESG-DRIVEN MARGIN-PRICING layer of a best-in-class lender stack; W38 covenant_certificate handles point-in-time FINANCIAL KPI, W77 reserve_account cash-balance covenants, W86 dscr_monitoring rolling FINANCIAL coverage, W45 loan_default catches what crystallises after cure_failed — W95 fills the gap with NON-FINANCIAL ESG KPIs measured annually, INDEPENDENTLY VERIFIED, driving contractual margin step-up/step-down per LMA SLL Principles + SA Green Finance Taxonomy 2025; beats Sustainalytics / ISS-ESG / MSCI ESG / S&P RobecoSAM CSA / Bloomberg ESG / Refinitiv ESG / LMA SLL Portal / ICMA SLBP / JSE Sustainability Index — all surface ESG SCORES but none drive a LIVE contractual margin ratchet against an independent attestation — via LIVE-scored TCFD-completeness battery (4 pillars: governance/strategy/risk-mgmt/metrics), SBTi alignment pathway (1.5°C / well-below-2°C / 2°C / not-aligned), SA Green Finance Taxonomy 2025 alignment %, verification-provenance band (big4/iso14065_accredited/industry/inadequate), effective margin bps live (base + cumulative ratchet), cumulative-ratchet ZAR over remaining tenor, PREDICTED-AMENDMENT-DATE rolling forward; 13-state P6 kpi_period_open→baseline_set→measurement_collected→independent_verification→kpi_attested→ratchet_computed→margin_amended (terminal — clean period close) with breach_recorded→cure_period→{validate_cure→kpi_attested OR fail_cure→cure_failed (terminal)} branch, restatement→re_verify→independent_verification rejoin loop, cancelled + sustainability_event terminals; tier KPI-VARIANCE-DERIVED on every transition from |kpi_variance_pct| × materiality_class — minor<5pp / standard 5-15pp / material 15-30pp / severe ≥30pp with FLOOR-AT-MATERIAL for climate_kpi/safety_kpi/mandatory_disclosure_kpi; INVERTED SLA — ESG-material breaches need structural remediation (training/capex/supply-chain redesign), severe cure window 180d vs minor 21d; BREACH/CURE-FAILED-driven SIGNATURE: record_breach crosses regulator EVERY tier (W95 SIGNATURE — SARB CPS 2024 mandatory disclosure; sister of W94 award_capacity / W93 impose_penalty / W92 realize_risk / W86 declare_acceleration / W77 declare_breach), fail_cure crosses regulator EVERY tier (SA Green Finance Taxonomy 2025 + JSE SRL mandatory disclosure), raise_restatement crosses material+severe, amend_margin severe-only, attest_kpi on floor-at-material classes always or severe variance, sla_breached material+severe; single lender-side write {admin,lender}, actor_party sustainability_officer/verifier/credit_committee/borrower from action — borrower reads own case via tenant scoping but cannot write ───
  | 'sll_kpi.kpi_period_open' | 'sll_kpi.baseline_set'
  | 'sll_kpi.measurement_collected' | 'sll_kpi.independent_verification'
  | 'sll_kpi.kpi_attested' | 'sll_kpi.ratchet_computed'
  | 'sll_kpi.margin_amended' | 'sll_kpi.breach_recorded'
  | 'sll_kpi.cure_period' | 'sll_kpi.cure_failed'
  | 'sll_kpi.restatement' | 'sll_kpi.cancelled'
  | 'sll_kpi.sustainability_event' | 'sll_kpi.sla_breached'
  // ─── Reports-deep (regulator submission lifecycle) ─────────────────────
  | 'report.submitted_to_regulator' | 'report.submission_acknowledged'
  // ─── Go-live KYC/POPIA/Regulator generators ────────────────────────────
  | 'kyc.document_submitted' | 'kyc.document_reviewed'
  | 'popia.export_requested' | 'popia.erasure_requested' | 'popia.erasure_cancelled'
  | 'regulator.nersa_quarterly_generated' | 'regulator.sars_pack_generated'
  // ─── PAIA (public-legal) ────────────────────────────────────────────────
  | 'paia.request_received'
  // ─── Settlement automation (runs + DLQ + meter ingest) ─────────────────
  | 'settlement.run_started' | 'settlement.run_retried'
  | 'settlement.dlq_resolved' | 'settlement.meter_channel_configured'
  // ─── BRP imbalance settlement ──────────────────────────────────────────
  | 'imbalance.prices_published' | 'imbalance.run_completed' | 'imbalance.run_failed'
  // ─── Admin operations (user + tenant lifecycle) ────────────────────────
  | 'admin.user_created' | 'admin.user_suspended'
  | 'admin.password_reset_issued' | 'admin.tenant_created'
  // ─── Support console (POPIA-sensitive impersonation + tickets) ─────────
  | 'support.impersonation_started' | 'support.ticket_opened'
  | 'support.ticket_transitioned' | 'support.escalation_filed'
  | 'support.cross_tenant_access'
  // ─── Platform-features (api-keys + webhook subscriptions) ──────────────
  | 'platform.api_key_issued' | 'platform.api_key_revoked'
  | 'platform.webhook_subscribed' | 'platform.webhook_disabled'
  // ─── Regulator suite extensions (conditions, surveillance, recon) ──────
  | 'regulator.licence_condition_added'
  | 'regulator.surveillance_rule_updated' | 'regulator.surveillance_alert_resolved'
  | 'regulator.enforcement_event_logged'
  | 'regulator.audit_exported' | 'regulator.recon_completed'
  // ─── Carbon registry extensions (serials, certificates, audit) ─────────
  | 'carbon.serial_transferred' | 'carbon.serial_retired'
  | 'carbon.retirement_certificate_issued'
  | 'carbon.audit_exported' | 'carbon.recon_completed'
  // ─── Participants admin lifecycle ──────────────────────────────────────
  | 'participant.kyc_verified' | 'participant.status_changed'
  // ─── Backup & DR ───────────────────────────────────────────────────────
  | 'backup.completed' | 'backup.failed'
  // ─── SIEM forwarders ───────────────────────────────────────────────────
  | 'siem.forwarder_created' | 'siem.forwarder_updated'
  | 'siem.forwarder_tested' | 'siem.events_dispatched'
  // ─── Platform AI / scenarios / filings / anomalies ─────────────────────
  | 'platform.ai_classified' | 'platform.ai_classification_overridden'
  | 'platform.scenario_run' | 'platform.audit_chain_appended'
  | 'platform.anomaly_logged' | 'platform.anomaly_scanned'
  | 'platform.anomaly_updated'
  | 'platform.filing_created' | 'platform.filing_submitted' | 'platform.filing_updated'
  // ─── Data-tier rollups & archives ──────────────────────────────────────
  | 'data_tier.metering_rolled' | 'data_tier.metering_archived'
  | 'data_tier.audit_archived' | 'data_tier.ona_rolled'
  | 'data_tier.snapshot_taken' | 'data_tier.tenant_quota_set'
  // ─── Wave 1: IPP project schedule (WBS + CPM + leveling + baselines) ──
  | 'project.schedule.activity.created' | 'project.schedule.activity.updated'
  | 'project.schedule.activity.deleted'
  | 'project.schedule.dependency.created' | 'project.schedule.dependency.deleted'
  | 'project.schedule.calendar.updated' | 'project.schedule.resource.updated'
  | 'project.schedule.assignment.updated'
  | 'project.schedule.recomputed' | 'project.schedule.leveled'
  | 'project.schedule.baseline.saved' | 'project.schedule.critical_path.changed'
  // ─── Wave 2: trading risk (daily VaR + scenario engine) ─────────────────
  | 'risk.portfolio.created' | 'risk.portfolio.updated' | 'risk.portfolio.deleted'
  | 'risk.var.recomputed'
  | 'risk.scenario.created' | 'risk.scenario.updated' | 'risk.scenario.deleted'
  | 'risk.scenario.run'
  // ─── Wave 3: settlement & clearing CPMI-IOSCO PFMI grade ─────────────────
  | 'clearing.disclosure.computed' | 'clearing.disclosure.published'
  | 'settlement.dvp.cash_confirmed' | 'settlement.dvp.energy_confirmed'
  | 'settlement.dvp.locked' | 'settlement.dvp.released'
  | 'clearing.margin.gate_changed' | 'clearing.margin.override_set'
  | 'settlement.fail.escalated' | 'settlement.fail.resolved'
  // ─── Wave 4: Article 6 ITMO corresponding-adjustment ledger ──────────────
  | 'carbon.article6.adjustment_created'
  | 'carbon.article6.dffe_submitted' | 'carbon.article6.dffe_cleared'
  | 'carbon.article6.unfccc_posted' | 'carbon.article6.blocked'
  | 'carbon.country_routing.updated'
  | 'carbon.serial_uri.resolved'
  // ─── Wave 96: IPP submittal & RFI register P6 chain ─────────────────
  | 'submittal_rfi.drafted' | 'submittal_rfi.submitted'
  | 'submittal_rfi.distributed' | 'submittal_rfi.under_review'
  | 'submittal_rfi.clarification_requested' | 'submittal_rfi.responded'
  | 'submittal_rfi.approved' | 'submittal_rfi.returned_for_revision'
  | 'submittal_rfi.revised' | 'submittal_rfi.distributed_for_construction'
  | 'submittal_rfi.incorporated' | 'submittal_rfi.closed_clean'
  | 'submittal_rfi.voided' | 'submittal_rfi.withdrawn'
  | 'submittal_rfi.sla_breached'
  // ─── Wave 97: IPP daily field report / progress diary P6 chain ─────
  | 'dfr.drafted' | 'dfr.entries_open' | 'dfr.entries_closed'
  | 'dfr.submitted' | 'dfr.under_review'
  | 'dfr.returned_for_correction' | 'dfr.corrected'
  | 'dfr.approved' | 'dfr.distributed' | 'dfr.archived'
  | 'dfr.voided' | 'dfr.withdrawn'
  | 'dfr.sla_breached'
  // ─── Wave 98: IPP punch list / COD snag handover P6 chain ──────────
  | 'punch_list.identified' | 'punch_list.assessed' | 'punch_list.assigned'
  | 'punch_list.in_remediation' | 'punch_list.reinspect_requested'
  | 'punch_list.reinspected' | 'punch_list.accepted' | 'punch_list.closed'
  | 'punch_list.on_hold' | 'punch_list.voided' | 'punch_list.withdrawn'
  | 'punch_list.sla_breached'
  // ─── Wave 99: IPP ITP / Quality inspection & test plan P6 chain ────
  | 'itp.itp_drafted' | 'itp.submitted' | 'itp.under_review' | 'itp.approved'
  | 'itp.released_to_site' | 'itp.inspection_scheduled' | 'itp.in_inspection'
  | 'itp.witness_attended' | 'itp.result_recorded' | 'itp.passed' | 'itp.failed'
  | 'itp.corrective_action' | 'itp.released_for_use' | 'itp.archived'
  | 'itp.rejected' | 'itp.withdrawn' | 'itp.voided'
  | 'itp.sla_breached'
  // ─── Wave 100: IPP Mechanical/Electrical Handover Dossier + Turnover ──
  | 'handover_dossier.dossier_compiled' | 'handover_dossier.submitted'
  | 'handover_dossier.under_review' | 'handover_dossier.revision_required'
  | 'handover_dossier.approved'
  | 'handover_dossier.witnessed_acceptance_scheduled'
  | 'handover_dossier.witnessed_acceptance'
  | 'handover_dossier.punch_remediated'
  | 'handover_dossier.training_transferred'
  | 'handover_dossier.warranty_activated'
  | 'handover_dossier.operations_owned'
  | 'handover_dossier.archived'
  | 'handover_dossier.rejected' | 'handover_dossier.withdrawn'
  | 'handover_dossier.voided'
  | 'handover_dossier.sla_breached'
  // ─── Wave 101: Offtaker PPA Annual Reconciliation & True-Up (P6); the annual financial-close gate of a PPA. Aggregates 12 months of W87 nominations + deviations + settlements, the W32 annual take-or-pay residual, the W39 CPI tariff indexation true-up, the W46 deemed-energy curtailment credits, the W54 payment-security release/redraw, and the capacity payment annual roll into ONE closed-year ledger with auditor + counterparty signoff, a restate-after-settlement door, and a regulator hard line on year re-opens. Beats EnPowered PPA Settlement + DNV Synergi PPA + Schneider PPA Manager + Open Energi Reconciliation + KPMG PPA Recon + Power Advocate Annual + Aurora Energy Research PPA Annual + Wood Mackenzie PPA Annual via LIVE annual-close battery (reconciliation_completeness_index 0-130 baseline 100, top_residual_zar, cpi_true_up_zar, capacity_payment_year_zar, deemed_energy_credit_zar, net_cash_position_zar, mwh_contracted_pct_delivered, days_to_signoff, urgency_band, predicted_year_close_date, authority_required) re-computed every fetch + tier RE-DERIVED on every transition from MAX(|variance|% band, top_residual_zar band) with FLOOR-AT-MATERIAL on top_residual>R100m / cpi_true_up>R50m / offtake_shortfall>20% / contract_year_end_strict. INVERTED SLA (larger variance + residual = MORE time for forensic reconciliation + audit + counterparty signoff). FINANCIAL-CLOSE SIGNATURE (IFRS 15 + NERSA s34): restate_year crosses regulator EVERY tier (post-signoff restatement always reportable, sister of W77 declare_breach + W45 write_off); raise_dispute crosses EVERY tier (PPA disputes to NERSA s30, sister of W87 raise_dispute + W66 lodge_appeal); sign_off crosses material+major (large signoff disclosable); cancel_year crosses EVERY tier when year had any delivery; sla_breached crosses material+major. Single offtaker-desk write {admin,offtaker}; actor_party settlement_analyst/counterparty/finance_controller/auditor/regulator_observer from action. ───
  | 'ppa_annual_recon.data_collected' | 'ppa_annual_recon.variance_classified'
  | 'ppa_annual_recon.top_residual_computed' | 'ppa_annual_recon.cpi_capacity_applied'
  | 'ppa_annual_recon.reconciled' | 'ppa_annual_recon.disputed'
  | 'ppa_annual_recon.dispute_resolved' | 'ppa_annual_recon.signed_off'
  | 'ppa_annual_recon.invoiced' | 'ppa_annual_recon.settled'
  | 'ppa_annual_recon.restated' | 'ppa_annual_recon.cancelled'
  | 'ppa_annual_recon.sla_breached'
  // ─── Wave 102: Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain Audit (P6); PV soiling is one of the single biggest controllable production losses on a SA solar plant. 12-state chain on oe_soiling_audit covers periodic soiling-ratio measurement (reference-cell + dirty/clean pair), inspection record (visual + IR + drone), economic assessment (lost MWh tariff vs cleaning ZAR + water m3), cleaning authorisation gate (water-restrictions, neighbour notices, DFFE conditions), field cleaning execution, post-clean PR-delta validation, settled audit ledger feeding W79 generation revenue assurance, and counterparty dispute branch. Beats NTT Data Soiling Maps + Power Factors Drive Soiling + AlsoEnergy Soiling Loss Index + 3E SynaptiQ Soiling + Above Surveying drone IR + Heliolytics aerial PV + Atonometrics RSE-1 + DEWA-RTC + DroneDeploy via 12-state P6 + tier RE-DERIVED on every transition from soiling_ratio_pct (minor<2 / standard 2-4 / material 4-8 / severe>=8) + FLOOR-AT-MATERIAL on rainy_season_window_strict / post_dust_storm_event / neighbour_complaint_filed / water_restriction_active + URGENT SLA (higher soiling band = TIGHTER) + cleaning-ROI ledger (mwh_loss_per_day, zar_loss_per_day, cleaning_roi_ratio, days_to_breakeven, post_clean_pr_pct, recovered_zar) + 4-step authority ladder (site_supervisor->plant_manager->asset_director->cfo). PRODUCTION-LOSS SIGNATURE (NERSA REIPPPP production reporting + DFFE water-use): raise_dispute crosses regulator EVERY tier (production-loss dispute always reportable, sister of W79 raise_dispute + W34 declare_curtailment + W46 raise_arbitration); authorize_cleaning crosses EVERY tier when water_consumption_m3 >= 100 OR installed_capacity_mw >= 50 (DFFE WUL + NERSA large-plant); cancel_audit crosses EVERY tier on material+severe; sla_breached crosses material+severe. Single esums-desk write {admin,support}; actor_party site_supervisor/cleaning_contractor/plant_owner/regulator_observer from action. ───
  | 'soiling_audit.inspection_scheduled' | 'soiling_audit.field_inspected'
  | 'soiling_audit.soiling_measured' | 'soiling_audit.economics_assessed'
  | 'soiling_audit.cleaning_authorized' | 'soiling_audit.cleaning_started'
  | 'soiling_audit.cleaning_completed' | 'soiling_audit.post_clean_measured'
  | 'soiling_audit.gain_validated' | 'soiling_audit.settled'
  | 'soiling_audit.dispute_raised' | 'soiling_audit.dispute_resolved'
  | 'soiling_audit.cancelled' | 'soiling_audit.sla_breached'

  | 'esg_disclosure.data_collected' | 'esg_disclosure.boundary_verified'
  | 'esg_disclosure.metrics_computed' | 'esg_disclosure.draft_compiled'
  | 'esg_disclosure.review_submitted' | 'esg_disclosure.assurance_engaged'
  | 'esg_disclosure.assurance_started' | 'esg_disclosure.assurance_completed'
  | 'esg_disclosure.published' | 'esg_disclosure.filed'
  | 'esg_disclosure.archived' | 'esg_disclosure.dispute_raised'
  | 'esg_disclosure.dispute_resolved' | 'esg_disclosure.restated'
  | 'esg_disclosure.cancelled' | 'esg_disclosure.sla_breached'

  // ─── Wave 104: Support ITIL Service Request Fulfilment chain (P6). 11th OEM-Support chain — the catalog + entitlement + fulfilment workflow, distinct from W14 reactive triage, W41 root-cause analysis, W47 RFC/CAB, W55 vulnerability remediation. Service requests are catalog-driven, pre-approved, low-risk requests like rotate API key, provision substation read access, request a spare meter swap, request a site-visit window, audit-evidence pull. They flow off the W80 service-contract entitlement gate, route through approval (low-risk autonomic, configuration-change CAB-mandated), assign to a fulfiller, run to fulfilled/verified/closed, and feed first-time-fix and reopened metrics back into the service desk. Beats ServiceNow ITSM Service Catalog + BMC Helix Request + Jira SM Request + Atlassian Assist + Freshservice Request Catalog + Ivanti Neurons Service Request + SolarWinds Service Desk Request + ManageEngine ServiceDesk Plus Request + Cherwell SRC + TOPdesk by making service requests a 12-state P6 chain with live entitlement score from W80, CAB bridge to W47, first-time-fix telemetry, and signature regulator crossings. Tier RE-DERIVED on every transition from severity_zar (minor<50k / standard<500k / material<5m / critical>=5m), FLOOR-AT-MATERIAL on data_export_popia/grid_significant/sla_premium_contract, FLOOR-AT-CRITICAL on access_to_critical_system/oem_break_glass. URGENT SLA polarity (higher tier = TIGHTER, critical 4h / minor 14d on submitted). SIGNATURE: reject crosses regulator EVERY tier when regulator_relevant (catalog-rejection always reportable); mark_fulfilled crosses regulator on critical when grid_significant (security-of-supply signature); cancel_request crosses regulator EVERY tier when entitled AND regulator_relevant; sla_breached crosses on material+critical. Write {admin,support}; READ all 9 personas; actor_party functional requester/approver/fulfiller/verifier/archiver from action. ───
  | 'service_request.submitted' | 'service_request.entitlement_checked'
  | 'service_request.approval_pending' | 'service_request.approved'
  | 'service_request.rejected' | 'service_request.assigned'
  | 'service_request.fulfilment_started' | 'service_request.awaiting_user'
  | 'service_request.user_responded' | 'service_request.fulfilled'
  | 'service_request.verified' | 'service_request.closed'
  | 'service_request.archived' | 'service_request.cancelled'
  | 'service_request.reopened' | 'service_request.regulator_crossed'
  | 'service_request.sla_breached'

  // ─── Wave 105: Grid Wholesale Imbalance Settlement & MTU Pricing chain (P6). 10th Grid chain — the financial settlement engine of the SO balancing mechanism. Sister of W13 dispatch nominations (the PRE side — nominated MWh per MTU) and W50 reserve activation (the SUPPLY side — instantaneous reserve products). W105 is the post-fact per-MTU settlement: actual vs nominated imbalance MWh times imbalance price times penalty, posted to BRPs, with dispute-window and settled. Beats PJM iMM / ERCOT QSE / CAISO / NEM AEMO / Nord Pool / ENTSO-E / National Grid ESO BSC / Hitachi Lumada / OATI / Powel Pulse — every one of those surfaces imbalance settlement as an after-the-fact CSV dump plus a dispute mailbox. W105 makes it a 12-state P6 chain with LIVE per-MTU re-pricing, dispute-window state machine, completeness index 0-130, urgency band, authority ladder, and signature regulator crossings. Tier RE-DERIVED on every transition from imbalance_quantum_zar (minor<100k / standard<1m / material<10m / systemic>=10m), FLOOR-AT-MATERIAL on any one of 5 floor flags, FLOOR-AT-SYSTEMIC on high_voltage_brp OR system_critical_period. URGENT SLA polarity (higher tier = TIGHTER, systemic 12h / minor 14d on period_open). SIGNATURE: raise_dispute crosses regulator EVERY tier when high_voltage_brp=TRUE (HV-imbalance disputes always reportable); mark_settled crosses regulator on material+systemic when penalty_zar>0; aged_arrears crosses EVERY tier at >=60 days (default risk to settlement system); cancel_period crosses EVERY tier when imbalance_mwh!=0; sla_breached crosses material+systemic. Write {admin,grid_operator}; READ all 9 personas; actor_party derived from action: system_operator/settlement_admin/brp/reviewer/archiver. ───
  | 'imbalance_settlement.period_opened' | 'imbalance_settlement.meter_data_received'
  | 'imbalance_settlement.nominations_reconciled' | 'imbalance_settlement.imbalance_computed'
  | 'imbalance_settlement.priced' | 'imbalance_settlement.invoice_issued'
  | 'imbalance_settlement.invoice_acknowledged' | 'imbalance_settlement.dispute_window_opened'
  | 'imbalance_settlement.dispute_raised' | 'imbalance_settlement.dispute_resolved'
  | 'imbalance_settlement.invoice_revised' | 'imbalance_settlement.payment_recorded'
  | 'imbalance_settlement.settled' | 'imbalance_settlement.archived'
  | 'imbalance_settlement.cancelled' | 'imbalance_settlement.aged_arrears'
  | 'imbalance_settlement.sla_breached'

  // ─── Wave 107: Trader Pre-Trade Credit Check & Settlement-Risk Exposure chain (P6). 10th Trader chain — PRE-TRADE GATE upstream of W2 trading-risk, W9 MM compliance, W29 position-limit, W36 best-execution, W44 trade-reporting, W52 market-abuse, W60 algo-cert, W68 counterparty-margin, W76 trade-allocation. Every one of those Trader chains assumes the synchronous front-end (KYC + credit-line + settlement-risk + concentration + halt-status + mark-age) was cleared. W107 turns that implicit rule-set evaluator into a 12-state P6 chain with sub-second SLA, LIVE 14-field battery (credit_line_utilization, settlement_risk_score, concentration_ratio, kyc_recency, mark_age, halt_status, 0-130 completeness, sla_seconds_remaining, urgency_band, authority_required ladder, regulator_filing_window, breach_imminent, 3-bridge architecture to W2/W29/W68), FLOOR-AT-MATERIAL tier overlay, 4-step authority ladder (junior_trader → desk_head → market_risk_manager → CRO), and signature regulator crossings. Beats Numerix CrossAsset Pre-Trade / Calypso Pre-Trade Limits / Bloomberg AIM Pre-Trade Compliance / Murex MX.3 PFE / FIS Front Arena / OpenLink Endur Pre-Deal / SAS Risk Management / Misys Kondor+ / Wall Street Systems Front-Arena — every one of those surfaces pre-trade as one large blocking rule-set evaluator. Tier RE-DERIVED on every transition from notional_exposure_zar (micro<1m / standard<10m / material<100m / systemic>=100m), FLOOR-AT-MATERIAL on any one of 5 floor flags, FLOOR-AT-SYSTEMIC on cross_border_settlement OR counterparty_credit_grade_below_B. URGENT sub-second SLA polarity stored as sla_target_ms BIGINT (order_submitted systemic 500ms / material 2s / standard 10s / micro 30s). SIGNATURE: reject_order crosses regulator EVERY tier when counterparty_credit_grade_below_B=TRUE (B-grade hard line — W107 signature, sister of W104 reject EVERY tier on regulator_relevant, W105 raise_dispute EVERY tier on HV_brp, W106 impose_sanction EVERY tier on licence_revocation); override_rejection crosses EVERY tier (compliance override is reportable); hold_for_review crosses material+systemic when SLA-triggered; sla_breached crosses systemic only (BIS PFMI s3.5). Standards: FMA Ch.X s50 + FSCA Conduct Standard 1/2020 + BIS PFMI s3.5 + CFTC Reg 1.73 + MiFID II Art 17. Write {admin,trader}; READ all 9 personas; actor_party split: trader writes submit_order; risk_system writes verify_kyc/check_credit_line/assess_settlement_risk/check_concentration/verify_halt_status/validate_mark_age/clear_order; compliance writes hold_for_review/manually_clear/manually_reject/reject_order/override_rejection; archiver writes archive_check. ───
  | 'pretrade_credit.order_submitted' | 'pretrade_credit.kyc_verified'
  | 'pretrade_credit.credit_line_checked' | 'pretrade_credit.settlement_risk_assessed'
  | 'pretrade_credit.concentration_checked' | 'pretrade_credit.halt_status_verified'
  | 'pretrade_credit.mark_age_validated' | 'pretrade_credit_cleared'
  | 'pretrade_credit.archived' | 'pretrade_credit_rejected'
  | 'pretrade_credit_held_for_review' | 'pretrade_credit.manually_cleared'
  | 'pretrade_credit.manually_rejected' | 'pretrade_credit_overridden'
  | 'pretrade_credit_sla_breached'

  // ─── Wave 108: Lender Loan Restructure & Amendment-and-Extend (A&E) / Forbearance Chain (P6). 11th Lender chain — fills the STRUCTURED-FORBEARANCE gap between W38 covenant certificate (point-in-time breach detection) + W86 DSCR monitoring (rolling coverage watch) and W45 default enforcement (acceleration / step-in). Without W108 every breach escalates straight to acceleration which kills bankability — restructure is the renegotiation runway every project-finance loan needs at least once in its life. 12-state P6 on oe_loan_restructure: trigger_event → preliminary_assessment → restructure_proposal_drafted → lender_credit_committee_review → borrower_term_sheet_negotiation → term_sheet_signed → legal_documentation_drafted → consent_solicitation → signing → effective_date → monitoring_period → completed + 3 terminal branches (rejected_by_committee/abandoned/escalated_to_default) + revise_proposal loop back to restructure_proposal_drafted. 18 actions; Tier RE-DERIVED on every transition from facility_amount_zar (minor<R50m / standard<R500m / material<R5b / systemic>=R5b), FLOOR-AT-MATERIAL on any one of 5 floor flags (cross_border_syndicate, sustainability_linked_loan, public_bondholder_consent_required, ifrs9_stage_3_at_trigger, sarb_large_exposure_threshold), FLOOR-AT-SYSTEMIC on 2+ flags OR public_bondholder OR SARB large exposure. INVERTED SLA polarity stored as HOURS — systemic gets LONGEST runway (LMA syndicate fairness + SARB disclosure rules); trigger_event window minor 30d / standard 60d / material 120d / systemic 180d. Beats LMA "Amend & Extend" templates / Fitch RestructuringRating / S&P Recovery Ratings / Moody's Covenant Quality Index / Reorg Research RestructuringDB / Debtwire Restructuring / Crescendo Strategic Advisors / Houlihan Lokey Financial Restructuring / FTI Consulting Corporate Finance / AlixPartners Restructuring — every one of those surfaces restructure as a transaction (term-sheet + amendment doc); W108 turns it into a 12-state P6 chain with 16-field LIVE battery (sla_hours_remaining, urgency_band, authority_required ladder, board_escalation_required, regulator_filing_window, consent_threshold/majority/passed, days_to_consent_deadline, floor_flag_count, proposed_relief_zar, principal_reschedule_pct, ifrs9_stage_at_trigger, restructure_completeness_index 0-130, 3-bridge architecture to W38/W86/W45). 5-step authority ladder: relationship_manager → credit_committee → portfolio_director → CRO → board_credit_subcommittee. Standards: LMA "Amendment & Extension" template + Basel III IFRS 9 Stage 2/3 + SARB Banks Act §61 (forbearance disclosure) + Companies Act §155 (Compromise with creditors). SIGNATURE crossings: escalate_to_default crosses regulator EVERY tier (W108 hard line — failed restructure feeding W45 universally reportable, sister of W104 reject EVERY tier on regulator_relevant, W105 raise_dispute EVERY tier on HV_brp, W106 impose_sanction EVERY tier on licence_revocation, W107 reject_order EVERY tier on credit_grade_below_B); submit_to_credit_committee crosses EVERY tier on systemic OR ifrs9_stage_3_at_trigger (Companies Act s.155 Compromise trigger); mark_effective crosses material+systemic (SARB Banks Act §61 large-exposure disclosure of effective restructure); launch_consent_solicitation crosses strategic on public_bondholder_consent_required only; sla_breached crosses material+systemic. Write {admin,lender}; READ all 9 personas; actor_party split: lender writes start_preliminary_assessment/draft_proposal/submit_to_credit_committee/approve_proposal/reject_proposal/draft_documentation/launch_consent_solicitation/mark_effective/monitor_compliance/complete_restructure/escalate_to_default; borrower writes trigger_restructure/revise_proposal/negotiate_term_sheet/sign_term_sheet/sign_amendment/abandon; syndicate_member writes record_consent. ───
  | 'loan_restructure_triggered' | 'loan_restructure_preliminary_assessment_started'
  | 'loan_restructure_proposal_drafted' | 'loan_restructure_submitted'
  | 'loan_restructure_approved' | 'loan_restructure_rejected'
  | 'loan_restructure_proposal_revised' | 'loan_restructure_term_sheet_negotiating'
  | 'loan_restructure_term_sheet_signed' | 'loan_restructure_documentation_drafted'
  | 'loan_restructure_consent_launched' | 'loan_restructure_consent_recorded'
  | 'loan_restructure_amendment_signed' | 'loan_restructure_effective'
  | 'loan_restructure_monitoring' | 'loan_restructure_completed'
  | 'loan_restructure_abandoned' | 'loan_restructure_escalated'
  | 'loan_restructure_sla_breached'

  // ─── Wave 109: Carbon Credit Quality Rating & Continuous Re-rating Chain (P6). 11th Carbon chain — buyer-side due-diligence rating engine over registered + verified carbon credits, bridging W37 (registration PDD), W11 (MRV verification), W42 (reversal / buffer pool). Without W109 every buyer has to trust the registry's binary "verified" stamp and a single static letter from Sylvera/BeZero/Pachama/Renoster/Calyx — material downgrades and fraud findings auto-feed the buffer pool drawdown queue. 12-state P6 on oe_carbon_credit_rating: rating_requested → desk_review → methodology_score → additionality_score → permanence_score → leakage_score → cobenefit_score → composite_score → published → monitoring → re_rating_triggered → re_rated + 3 terminal branches (downgraded soft / withdrawn / escalated_to_integrity) + remediate loop from downgraded back to monitoring. 16 actions; Tier RE-DERIVED on every transition from credit_vintage_year + scope_scale_tonnes (basic<50k single-vintage / standard<500k OR multi-vintage / premium<5m / institutional>=5m), FLOOR-AT-PREMIUM on any one of 5 floor flags (afolu_high_reversal_risk, methodology_under_review, external_credit_red_flag, ccp_aligned_project, article_6_authorised) OR Article 6, FLOOR-AT-INSTITUTIONAL on 2+ flags OR ccp_aligned_project OR institutional_buyer. INVERTED SLA polarity stored as HOURS — institutional gets LONGEST runway (deeper diligence); rating_requested window basic 30d / standard 60d / premium 120d / institutional 180d. Re-rating windows tighter (monitoring data already in-hand): basic 14d / institutional 90d. Beats Sylvera / BeZero Carbon Ratings / Pachama Verified Credits / Renoster Carbon Ratings / Calyx Global / Carbon Direct CDx / Patch Quality Layer / Cloverly Quality Tags / S&P Global carbon methodology / Moody KYC Carbon — every one of those surfaces a rating as a single static letter; W109 turns it into a 12-state P6 chain with INVERTED SLA polarity, FLOOR-AT-PREMIUM tier overlay, 4-step authority ladder (junior_analyst → senior_analyst → ratings_committee_chair → board_rating_committee), 17-field LIVE battery (composite_score + 5 sub-scores + S&P-style 8-band + 3-bridge architecture to W37/W11/W42 + ICROA bonus), continuous monitoring with auto re-rating (90d stale → auto trigger_rerating via system cron), and signature regulator crossings. Standards: CCP Core Carbon Principles + ICROA Code of Best Practice + Article 6.4 Methodologies + ISO 14064-3 (GHG validation and verification) + VCS/Verra integrity standards. SIGNATURE crossings: downgrade crosses regulator EVERY tier on composite_drop_pct>=20% OR rating_band drops to CCC/D (W109 hard line — material rating change = market integrity event, sister of W108 escalate_to_default EVERY tier on regulator_relevant, W104 reject EVERY tier on regulator_relevant); escalate_to_integrity crosses regulator EVERY tier (fraud finding hands off to W42 reversal); publish_rating crosses regulator premium+institutional when Article 6 (authorization status disclosed); withdraw crosses regulator EVERY tier when issuer_disputed (withdrawing under dispute = integrity event); sla_breached crosses premium+institutional only. Write {admin,carbon_fund}; READ all 9 personas; actor_party split: rater writes start_desk_review/score_methodology/score_additionality/score_permanence/score_leakage/score_cobenefits/compute_composite/publish_rating/start_monitoring/trigger_rerating/rerate/downgrade/withdraw/escalate_to_integrity; issuer writes request_rating/remediate. ───
  | 'carbon_rating_requested' | 'carbon_rating_desk_review_started'
  | 'carbon_rating_methodology_scored' | 'carbon_rating_additionality_scored'
  | 'carbon_rating_permanence_scored' | 'carbon_rating_leakage_scored'
  | 'carbon_rating_cobenefit_scored' | 'carbon_rating_composite_computed'
  | 'carbon_rating_published' | 'carbon_rating_monitoring_started'
  | 'carbon_rating_rerating_triggered' | 'carbon_rating_rerated'
  | 'carbon_rating_downgraded' | 'carbon_rating_withdrawn'
  | 'carbon_rating_escalated_integrity' | 'carbon_rating_remediated'
  | 'carbon_rating_sla_breached'

  // ─── Wave 110: Grid Transmission Network Outage Coordination & N-1 Security Assessment Chain (P6). 11th Grid chain — SO-initiated EHV/HV transmission line + substation outage windows with N-1 contingency security assessment + reliability-committee approval + real-time supervision + return-to-service verification. Distinct from W18 (asset-owner-driven planned outage on IPP generators). Beats Hitachi Energy Lumada / ABB Network Manager / Siemens Spectrum / GE PowerOn / OSI monarch / OATI WebTrans / Eskom NCC / PowerWorld / Schneider EcoStruxure ADMS — each surfaces TX outage planning as a calendar plus a CSV of affected feeders; W110 turns it into a 12-state P6 chain with URGENT SLA polarity stored in HOURS, FLOOR-AT-HIGH tier overlay on 5 floor flags (peak_demand_period, single_circuit_radial, cross_border_interconnector, black_start_path, national_grid_backbone), FLOOR-AT-CRITICAL on 2+ flags OR national_grid_backbone OR black_start_path, 4-step authority ladder (outage_planner → system_operator → reliability_committee_chair → SO_CEO), 16-field LIVE battery (sla_hours_remaining, urgency_band, authority_required, regulator_filing_window_hours, security_margin_pct, hours_to_outage_window, hours_in_outage, hours_to_planned_completion, extension_imminent, emergency_cancel_risk, returned_to_service_clean, floor_flag_count, completeness 0-130 with 4 bonus categories, 3-bridge to W18/W34/W50), and signature regulator crossings. Standards: NERSA Grid Code C-3 + NTCSA Outage Coordination Process + Eskom System Operator Standards + ENTSO-E SO Reg 2017/1485 equivalent. 12-state P6 on oe_transmission_outage: outage_requested → security_assessment → n1_contingency_run → reliability_committee_review → outage_approved → outage_window_open → outage_in_progress → outage_completed → return_to_service → post_outage_review → archived (HARD terminal) + 5 branches (rejected/withdrawn/suspended/emergency_cancelled/extended). Tier RE-DERIVED on every transition from transmission_voltage_kv (low_sub132kv<132 / medium_132kv=132 / high_275kv>=275<400 / critical_400kv_plus>=400). URGENT SLA polarity stored as HOURS — critical_400kv_plus has SHORTEST runway (outage_requested critical 24h / high 72h / medium 168h / low 336h). SIGNATURE crossings: emergency_cancel crosses regulator EVERY tier (W110 hard line — forced cancellation of an approved TX outage is always a security event, sister of W108 escalate_to_default EVERY tier, W109 escalate_to_integrity EVERY tier, W105 raise_dispute EVERY tier on HV_brp, W104 reject EVERY tier on regulator_relevant); extend_outage crosses high+critical (committee fairness review); approve_outage crosses critical ONLY when national_grid_backbone (NERSA disclosure of backbone outage approvals); suspend_outage crosses high+critical; sla_breached crosses high+critical. Write {admin,grid_operator}; READ all 9 personas; actor_party split: outage_planner (request/start_security_assessment/withdraw), system_operator (run_n1_contingency/open_window/commence/suspend/resume/emergency_cancel/complete/verify_rts), reliability_committee (submit/approve/reject/extend), archive_clerk (close_post_review/archive). ───
  | 'transmission_outage_requested' | 'transmission_outage_security_assessment_started'
  | 'transmission_outage_n1_contingency_ran' | 'transmission_outage_submitted_to_committee'
  | 'transmission_outage_approved' | 'transmission_outage_rejected'
  | 'transmission_outage_window_opened' | 'transmission_outage_commenced'
  | 'transmission_outage_suspended' | 'transmission_outage_resumed'
  | 'transmission_outage_emergency_cancelled' | 'transmission_outage_extended'
  | 'transmission_outage_completed' | 'transmission_outage_return_to_service_verified'
  | 'transmission_outage_post_outage_review_closed' | 'transmission_outage_archived'
  | 'transmission_outage_withdrawn' | 'transmission_outage_sla_breached'

  // ─── Wave 111: Trader Daily P&L Attribution & Risk-Adjusted Returns Chain (P6). 11th Trader chain — EOD P&L decomposition engine that turns four numbers (MTM/realised/unrealised/total) into a stratified attribution (delta/gamma/vega/theta/FX/carry/residual), a risk-decomp (VaR contribution/scenario impact/KRI exceedances), a benchmark comparison (alpha/tracking-error/information ratio), a 4-step authority ladder, a 17-field LIVE battery (incl. Sharpe/Sortino/Information/max-drawdown), and signature regulator crossings when restatements stack or attribution gaps blow out. Distinct from W2 (rolling VaR), W9 (MM-compliance), W29 (position limits), W36 (best-execution), W44 (trade reporting), W52 (market-abuse), W60 (algo-cert), W68 (counterparty-margin), W76 (trade-allocation), W107 (pre-trade credit). Beats Murex MX.3 / Calypso / Bloomberg PORT / FIS Adaptiv / OpenLink Endur / OneTick / Imagine Risk / Kondor+ / Front Arena / SunGard FastVal — each surfaces daily P&L as a flat MTM tape plus an Excel-glued attribution; W111 turns it into a 12-state P6 chain with URGENT SLA polarity stored in HOURS, FLOOR-AT-MATERIAL tier overlay on 5 floor flags (stress_period_active, restated_within_30d, large_attribution_gap_pct_5_plus, regulatory_book_FRTB_IMA, cross_border_consolidation), FLOOR-AT-SYSTEMIC on 2+ flags OR FRTB_IMA OR cross_border. 12-state P6 on oe_pnl_attribution: day_open → mtm_run → realised_computed → unrealised_computed → attribution_decomposed → risk_decomposed → benchmark_compared → reviewed → approved → published → reconciled → archived (HARD terminal) + 3 branches (held_for_review loop, variance_investigation loop, restated loop). Tier RE-DERIVED from gross_notional_zar (minor<R10m / standard<R500m / material<R5b / systemic>=R5b). URGENT SLA polarity stored in HOURS — systemic gets SHORTEST runway (day_open systemic 6h / material 12h / standard 18h / minor 24h). SIGNATURE crossings: restate_pnl crosses regulator EVERY tier when restated_within_30d (W111 hard line — second restatement within 30d is always reportable to FSCA + audit committee, sister of W110 emergency_cancel EVERY tier, W109 escalate_to_integrity EVERY tier, W108 escalate_to_default EVERY tier, W105 raise_dispute EVERY tier on HV_brp); flag_variance_investigation crosses material+systemic when attribution_gap_pct>=10% (FMA Ch.X s50 disclosure of stratified-attribution failure); approve_pnl crosses systemic only when stress_period_active (FSCA CS 1/2020 stress-period reportability); publish_pnl crosses systemic only when FRTB_IMA (Basel III FRTB IMA disclosure rule); sla_breached crosses material+systemic. Standards: FMA Ch.X (financial-markets governance) + FSCA Conduct Standard 1/2020 + IFRS 9 (Stage 1/2/3 ECL classification) + IFRS 13 (Level 1/2/3 fair-value hierarchy) + Basel III FRTB IMA + SA + GIPS 2020 + MAR. Write {admin,trader}; READ all 9 personas; actor_party split: trader (open_day/run_mtm/compute_realised/compute_unrealised); risk_analyst (decompose_attribution/decompose_risk/compare_to_benchmark/submit_to_review/flag_variance_investigation); desk_head (approve_pnl/hold_for_review/override_hold); market_risk_manager (publish_pnl); finance (reconcile/archive_pnl); CFO (restate_pnl). ───
  | 'pnl_attribution_day_opened' | 'pnl_attribution_mtm_ran'
  | 'pnl_attribution_realised_computed' | 'pnl_attribution_unrealised_computed'
  | 'pnl_attribution_attribution_decomposed' | 'pnl_attribution_risk_decomposed'
  | 'pnl_attribution_benchmark_compared' | 'pnl_attribution_submitted_to_review'
  | 'pnl_attribution_approved' | 'pnl_attribution_held_for_review'
  | 'pnl_attribution_hold_overridden' | 'pnl_attribution_published'
  | 'pnl_attribution_reconciled' | 'pnl_attribution_archived'
  | 'pnl_attribution_variance_flagged' | 'pnl_attribution_restated'
  | 'pnl_attribution_sla_breached'
  // Wave 112 — IPP WBS & Gantt Schedule Management (12-state P6)
  | 'ipp_schedule_wbs_drafted' | 'ipp_schedule_baseline_set'
  | 'ipp_schedule_execution_started' | 'ipp_schedule_progress_updated'
  | 'ipp_schedule_variance_detected' | 'ipp_schedule_impact_assessed'
  | 'ipp_schedule_rebaselined' | 'ipp_schedule_recovery_proposed'
  | 'ipp_schedule_recovered' | 'ipp_schedule_completed'
  | 'ipp_schedule_late_finish_marked' | 'ipp_schedule_suspended'
  | 'ipp_schedule_resumed' | 'ipp_schedule_cancelled'
  | 'ipp_schedule_rebaseline_approved' | 'ipp_schedule_rebaseline_rejected'
  | 'ipp_schedule_sla_breached'
  // Wave 113 — IPP Cost Management & Earned Value Management (14-state P6)
  | 'ipp_evm_budget_set' | 'ipp_evm_cost_committed'
  | 'ipp_evm_cost_incurred' | 'ipp_evm_progress_measured'
  | 'ipp_evm_variance_detected' | 'ipp_evm_reforecast_drafted'
  | 'ipp_evm_cr_logged' | 'ipp_evm_cr_approved'
  | 'ipp_evm_reforecast_rejected' | 'ipp_evm_reforecast_published'
  | 'ipp_evm_reconciled' | 'ipp_evm_book_closed'
  | 'ipp_evm_cancelled' | 'ipp_evm_contingency_drawn'
  | 'ipp_evm_management_reserve_drawn' | 'ipp_evm_submitted_to_pm_review'
  | 'ipp_evm_sla_breached'
  // Wave 114 — IPP Document Control & Drawing Register (12-state P6)
  | 'ipp_doc_control_uploaded' | 'ipp_doc_control_indexed'
  | 'ipp_doc_control_revision_open' | 'ipp_doc_control_idc_assigned'
  | 'ipp_doc_control_transmitted' | 'ipp_doc_control_review_started'
  | 'ipp_doc_control_commented' | 'ipp_doc_control_revised'
  | 'ipp_doc_control_approved' | 'ipp_doc_control_issued_for_construction'
  | 'ipp_doc_control_as_built_finalised' | 'ipp_doc_control_archived'
  | 'ipp_doc_control_rejected' | 'ipp_doc_control_withdrawn'
  | 'ipp_doc_control_held' | 'ipp_doc_control_resumed'
  | 'ipp_doc_control_sla_breached'
  // Wave 115 — IPP Submittal / Transmittal Lifecycle (12-state P6)
  | 'ipp_submittal_drafted' | 'ipp_submittal_assembled'
  | 'ipp_submittal_submitted' | 'ipp_submittal_screened'
  | 'ipp_submittal_reviewer_assigned' | 'ipp_submittal_review_started'
  | 'ipp_submittal_coordinated' | 'ipp_submittal_response_drafted'
  | 'ipp_submittal_stamped' | 'ipp_submittal_resubmission_requested'
  | 'ipp_submittal_closed_out' | 'ipp_submittal_archived'
  | 'ipp_submittal_rejected' | 'ipp_submittal_voided'
  | 'ipp_submittal_escalated' | 'ipp_submittal_approved_with_comments'
  | 'ipp_submittal_sla_breached'
  // Wave 116 — IPP RFI (Request For Information) Lifecycle (12-state P6)
  | 'ipp_rfi_drafted' | 'ipp_rfi_submitted'
  | 'ipp_rfi_triaged' | 'ipp_rfi_responder_assigned'
  | 'ipp_rfi_research_started' | 'ipp_rfi_response_drafted'
  | 'ipp_rfi_coordinated' | 'ipp_rfi_answered'
  | 'ipp_rfi_clarification_requested' | 'ipp_rfi_closed_out'
  | 'ipp_rfi_archived' | 'ipp_rfi_rejected'
  | 'ipp_rfi_voided' | 'ipp_rfi_escalated'
  | 'ipp_rfi_converted_to_change_order' | 'ipp_rfi_linked_to_dispute'
  | 'ipp_rfi_sla_breached'
  // Wave 117 — IPP Change Orders & Variations Lifecycle (12-state P6, TARGET-
  // CLOSING Phase-A IPP-pure chain). 16 events covering 12 forward states +
  // 4 branch states. SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE crosses
  // regulator EVERY tier when scope_baseline_change || regulatory_re_consent
  // _required. reject crosses regulator EVERY tier when cumulative_change
  // _value_pct >= 15. dispute crosses regulator major + transformational
  // only. sla_breached crosses regulator major + transformational only.
  | 'ipp_change_order_proposed' | 'ipp_change_order_impact_assessed'
  | 'ipp_change_order_cost_quoted' | 'ipp_change_order_submitted_for_review'
  | 'ipp_change_order_negotiated' | 'ipp_change_order_approved'
  | 'ipp_change_order_issued' | 'ipp_change_order_scheduled'
  | 'ipp_change_order_execution_started' | 'ipp_change_order_execution_completed'
  | 'ipp_change_order_closed_out' | 'ipp_change_order_archived'
  | 'ipp_change_order_rejected' | 'ipp_change_order_voided'
  | 'ipp_change_order_hold_resumed' | 'ipp_change_order_disputed'
  | 'ipp_change_order_sla_breached'
  // Wave 118 — Hash-Chain Audit Trees & Tamper-Evident Ledger (Phase-B
  // opener, FIRST L5 regulator-grade hardening wave). 17 events covering
  // 10 forward states + 4 branches + SLA breach + quarterly export.
  // SIGNATURE SIGNATURE-CHAIN-BREAK-SEAL: emergency_seal crosses regulator
  // EVERY tier (W118 hard line). reject crosses regulator EVERY tier when
  // signature_chain_break_detected || hash_collision_suspected. restate
  // crosses regulator monthly + quarterly only. sla_breached crosses
  // regulator monthly + quarterly only.
  | 'audit_chain_block_proposed' | 'audit_chain_segments_collected'
  | 'audit_chain_merkle_built' | 'audit_chain_integrity_verified'
  | 'audit_chain_block_signed' | 'audit_chain_anchored'
  | 'audit_chain_published' | 'audit_chain_independently_verifiable'
  | 'audit_chain_reconciled' | 'audit_chain_archived'
  | 'audit_chain_rejected' | 'audit_chain_suspended'
  | 'audit_chain_resumed' | 'audit_chain_restated'
  | 'audit_chain_forked' | 'audit_chain_emergency_sealed'
  | 'audit_chain_sla_breached' | 'audit_chain_quarterly_export_ready'
  // ---------- Wave 119 — Certified Regulator Export Packs ----------
  // Phase-B wave 2 of 4 (after W118 audit-chain spine). 12-state machine
  // producing XBRL+iXBRL+ESG-narrative packs lodged via mTLS to NERSA /
  // IPPO / SARB / DMRE / FSCA / DFFE / DTI / JSE / SARS / CIPC. Joins the
  // W118 audit namespace ('audit' chain) so every pack mutation lands on
  // the same tamper-evident ledger spine.
  //
  // SIGNATURE: regulator_export_rejected_by_regulator crosses regulator
  // EVERY tier (regulator-issued rejection is always reportable).
  // regulator_export_sla_breached crosses on heavy tiers (quarterly_
  // attestation / half_year / annual_audit). withdrawn / restated cross
  // on heavy tiers.
  | 'regulator_export_pack_proposed' | 'regulator_export_blocks_selected'
  | 'regulator_export_leaves_filtered' | 'regulator_export_xbrl_assembled'
  | 'regulator_export_narratives_attached' | 'regulator_export_internal_qa'
  | 'regulator_export_counterparty_signoff' | 'regulator_export_packaged'
  | 'regulator_export_countersigned' | 'regulator_export_lodged_via_api'
  | 'regulator_export_pack_lodged'
  | 'regulator_export_acknowledged_by_regulator' | 'regulator_export_archived'
  | 'regulator_export_rejected_by_regulator' | 'regulator_export_withdrawn'
  | 'regulator_export_restated' | 'regulator_export_suspended'
  | 'regulator_export_resumed' | 'regulator_export_sla_breached'
  // Wave 120 — Reconciliation Attestation chain. Phase-B wave 3 of 4.
  // 12-state + 4 branch chain attesting that every cross-chain row +
  // external-system feed (SAP S/4HANA / Oracle / SAGE / Workday / STRATE /
  // SWIFT MT940 / NERSA/IPPO/DMRE inboxes / bank statements / W118
  // published blocks) reconciles against the W118 audit-chain spine.
  // INVERTED SLA HOURS: daily 24h / weekly 96h / monthly 168h /
  // quarterly 360h / annual 720h. Joins the SAME 'audit' chain as
  // W118+W119 so every attestation mutation lands on the platform-wide
  // tamper-evident ledger.
  //
  // SIGNATURE: escalate_to_audit_committee EVERY tier (ICFR-DEFICIENCY-
  // ATTEST hard line). reject EVERY tier when material_variance_
  // unresolved AND icfr_deficiency_suspected. restate quarterly+annual
  // only. sla_breached quarterly+annual only. sign_attestation NEVER
  // crosses (sign-off is internal control, not regulator-relevant by
  // itself).
  | 'reconciliation_attestation_proposed' | 'reconciliation_attestation_scope_defined'
  | 'reconciliation_attestation_feeds_ingested' | 'reconciliation_attestation_blocks_paired'
  | 'reconciliation_attestation_variance_computed' | 'reconciliation_attestation_break_classified'
  | 'reconciliation_attestation_root_cause_logged' | 'reconciliation_attestation_remediation_proposed'
  | 'reconciliation_attestation_counter_party_signoff' | 'reconciliation_attestation_independent_review'
  | 'reconciliation_attestation_signed' | 'reconciliation_attestation_archived'
  | 'reconciliation_attestation_rejected' | 'reconciliation_attestation_suspended'
  | 'reconciliation_attestation_resumed' | 'reconciliation_attestation_restated'
  | 'reconciliation_attestation_escalated_to_audit_committee'
  | 'reconciliation_attestation_lift_escalation'
  | 'reconciliation_attestation_sla_breached'
  // Wave 121 — Control-Environment Audit. FOURTH and FINAL Phase-B
  // wave. Closes Phase B (W118 spine + W119 exports + W120 attestation
  // + W121 control-environment audit). Per-control evidence dossiers
  // (Design / ToD / ToOE / deficiency / remediation) closing SOC 2
  // Type II + COSO 2013 ICIF + ISO 27001:2022 ISMS certification.
  //
  // SIGNATURE: flag_deficient EVERY tier WHEN material_weakness_
  // suspected (W121 MATERIAL-WEAKNESS-DEFICIENT hard line - SSAE 18 +
  // ISA 265 + JSE 8.62 + Companies Act s30 + COSO Monitoring).
  // accept_with_exception directive+governance only. archive EVERY
  // tier WHEN external_auditor_sign_off. sla_breached directive+
  // governance only.
  | 'control_environment_audit_defined'
  | 'control_environment_audit_design_documented'
  | 'control_environment_audit_walkthrough_completed'
  | 'control_environment_audit_tod_test_planned'
  | 'control_environment_audit_tod_evidence_collected'
  | 'control_environment_audit_tod_test_executed'
  | 'control_environment_audit_tooe_test_planned'
  | 'control_environment_audit_tooe_evidence_collected'
  | 'control_environment_audit_tooe_test_executed'
  | 'control_environment_audit_deficiency_assessed'
  | 'control_environment_audit_remediation_completed'
  | 'control_environment_audit_archived'
  | 'control_environment_audit_flagged_deficient'
  | 'control_environment_audit_accepted_with_exception'
  | 'control_environment_audit_suspended'
  | 'control_environment_audit_re_test_initiated'
  | 'control_environment_audit_sla_breached'
  | 'control_environment_audit_annual_cycle_opened'
  // Wave 122 — SCADA / IEC 61850 Substation Connector.
  // PHASE C OPENER (W122-W126 external-system connector family).
  // 12-state forward path + 4 branch states. 16 actions. SIGNATURE
  // SCADA-CONNECTOR-REVOKE hard line - revoke EVERY tier (NERSA Grid
  // Code C-3 + IEC 62351 + SANS 27001 + SARB BA 700 cyber-incident
  // notice). activate_failover crosses large+national. disconnect
  // EVERY tier WHEN critical_substation_n_minus_1.
  // authorize_control_commands national only. sla_breached
  // large+national.
  | 'scada_connector_proposed'
  | 'scada_connector_endpoints_discovered'
  | 'scada_connector_tls_configured'
  | 'scada_connector_handshake_completed'
  | 'scada_connector_telemetry_streaming'
  | 'scada_connector_quality_validated'
  | 'scada_connector_alarms_subscribed'
  | 'scada_connector_control_commands_authorized'
  | 'scada_connector_live_operations'
  | 'scada_connector_reconciliation_active'
  | 'scada_connector_archived'
  | 'scada_connector_disconnected'
  | 'scada_connector_suspended'
  | 'scada_connector_resumed'
  | 'scada_connector_revoked'
  | 'scada_connector_failover_activated'
  | 'scada_connector_sla_breached'

  // Wave 123 - MQTT / OPC-UA Edge-Device IIoT Connector.
  // 11-state forward path + 4 branch states. 16 actions. SIGNATURE
  // MQTT-OPCUA-REVOKE hard line - revoke_credential EVERY tier (NERSA
  // Grid Code C-3 + IEC 62443 + POPIA s19 + SARB BA 700 cyber-incident
  // notice). activate_failover crosses large+national. disconnect
  // EVERY tier WHEN critical_safety_payload. bind_companion_spec
  // national WHEN ieee_2030_5_csip_inverter_control. sla_breached
  // large+national.
  | 'mqtt_opcua_connector_proposed'
  | 'mqtt_opcua_connector_broker_provisioned'
  | 'mqtt_opcua_connector_topics_mapped'
  | 'mqtt_opcua_connector_tls_mutual_configured'
  | 'mqtt_opcua_connector_client_registered'
  | 'mqtt_opcua_connector_publishing_active'
  | 'mqtt_opcua_connector_subscription_validated'
  | 'mqtt_opcua_connector_companion_spec_bound'
  | 'mqtt_opcua_connector_live_streaming'
  | 'mqtt_opcua_connector_reconciliation_active'
  | 'mqtt_opcua_connector_archived'
  | 'mqtt_opcua_connector_disconnected'
  | 'mqtt_opcua_connector_suspended'
  | 'mqtt_opcua_connector_resumed'
  | 'mqtt_opcua_connector_credential_revoked'
  | 'mqtt_opcua_connector_failover_activated'
  | 'mqtt_opcua_connector_sla_breached'
  | 'strate_swift_connector_proposed'
  | 'strate_swift_connector_bic_validated'
  | 'strate_swift_connector_bank_handshake_completed'
  | 'strate_swift_connector_iso20022_schemas_loaded'
  | 'strate_swift_connector_messaging_session_established'
  | 'strate_swift_connector_test_messages_validated'
  | 'strate_swift_connector_reconciliation_account_bound'
  | 'strate_swift_connector_live_settlement_active'
  | 'strate_swift_connector_cycle_reconciled'
  | 'strate_swift_connector_archived'
  | 'strate_swift_connector_disconnected'
  | 'strate_swift_connector_suspended'
  | 'strate_swift_connector_resumed'
  | 'strate_swift_connector_credential_revoked'
  | 'strate_swift_connector_failover_activated'
  | 'strate_swift_connector_cycle_settled'
  | 'strate_swift_connector_sla_breached'
  | 'sap_oracle_erp_connector_proposed'
  | 'sap_oracle_erp_connector_endpoint_validated'
  | 'sap_oracle_erp_connector_company_code_mapped'
  | 'sap_oracle_erp_connector_chart_of_accounts_bound'
  | 'sap_oracle_erp_connector_schemas_loaded'
  | 'sap_oracle_erp_connector_idoc_session_established'
  | 'sap_oracle_erp_connector_test_postings_validated'
  | 'sap_oracle_erp_connector_reconciliation_period_bound'
  | 'sap_oracle_erp_connector_live_posting_active'
  | 'sap_oracle_erp_connector_period_close_reconciled'
  | 'sap_oracle_erp_connector_archived'
  | 'sap_oracle_erp_connector_disconnected'
  | 'sap_oracle_erp_connector_suspended'
  | 'sap_oracle_erp_connector_resumed'
  | 'sap_oracle_erp_connector_credential_revoked'
  | 'sap_oracle_erp_connector_failover_activated'
  | 'sap_oracle_erp_connector_sla_breached'
  | 'government_filing_connector_proposed'
  | 'government_filing_connector_authority_validated'
  | 'government_filing_connector_tax_registration_bound'
  | 'government_filing_connector_template_mapped'
  | 'government_filing_connector_schemas_loaded'
  | 'government_filing_connector_e_filing_session_established'
  | 'government_filing_connector_test_submission_validated'
  | 'government_filing_connector_reconciliation_period_bound'
  | 'government_filing_connector_live_filing_active'
  | 'government_filing_connector_filing_acknowledged'
  | 'government_filing_connector_archived'
  | 'government_filing_connector_disconnected'
  | 'government_filing_connector_suspended'
  | 'government_filing_connector_resumed'
  | 'government_filing_connector_credential_revoked'
  | 'government_filing_connector_failover_activated'
  | 'government_filing_connector_sla_breached'
  | 'anomaly_detection_ml_proposed'
  | 'anomaly_detection_ml_dataset_bound'
  | 'anomaly_detection_ml_features_engineered'
  | 'anomaly_detection_ml_train_test_split'
  | 'anomaly_detection_ml_trained'
  | 'anomaly_detection_ml_backtest_validated'
  | 'anomaly_detection_ml_calibrated'
  | 'anomaly_detection_ml_shadow_deployed'
  | 'anomaly_detection_ml_live_ab_active'
  | 'anomaly_detection_ml_champion_promoted'
  | 'anomaly_detection_ml_retrained'
  | 'anomaly_detection_ml_archived'
  | 'anomaly_detection_ml_drift_detected'
  | 'anomaly_detection_ml_rolled_back'
  | 'anomaly_detection_ml_recalled'
  | 'anomaly_detection_ml_failover_activated'
  | 'anomaly_detection_ml_sla_breached'
  | 'rul_prediction_ml_proposed'
  | 'rul_prediction_ml_survival_dataset_bound'
  | 'rul_prediction_ml_features_engineered'
  | 'rul_prediction_ml_train_test_split'
  | 'rul_prediction_ml_trained'
  | 'rul_prediction_ml_backtest_validated'
  | 'rul_prediction_ml_calibrated'
  | 'rul_prediction_ml_shadow_deployed'
  | 'rul_prediction_ml_live_ab_active'
  | 'rul_prediction_ml_champion_promoted'
  | 'rul_prediction_ml_retrained'
  | 'rul_prediction_ml_archived'
  | 'rul_prediction_ml_drift_detected'
  | 'rul_prediction_ml_rolled_back'
  | 'rul_prediction_ml_recalled'
  | 'rul_prediction_ml_failover_to_ols_activated'
  | 'rul_prediction_ml_sla_breached'
  | 'fault_fingerprint_ml_proposed'
  | 'fault_fingerprint_ml_labeled_dataset_bound'
  | 'fault_fingerprint_ml_class_imbalance_resolved'
  | 'fault_fingerprint_ml_features_engineered'
  | 'fault_fingerprint_ml_train_test_split'
  | 'fault_fingerprint_ml_multiclass_trained'
  | 'fault_fingerprint_ml_confusion_matrix_validated'
  | 'fault_fingerprint_ml_calibrated'
  | 'fault_fingerprint_ml_shadow_deployed'
  | 'fault_fingerprint_ml_live_ab_active'
  | 'fault_fingerprint_ml_champion_promoted'
  | 'fault_fingerprint_ml_retrained'
  | 'fault_fingerprint_ml_archived'
  | 'fault_fingerprint_ml_class_drift_detected'
  | 'fault_fingerprint_ml_rolled_back'
  | 'fault_fingerprint_ml_recalled'
  | 'fault_fingerprint_ml_failover_to_physics_baseline'
  | 'fault_fingerprint_ml_novel_class_added'
  | 'fault_fingerprint_ml_sla_breached'
  // W130 - NTT Comparison Battery (PHASE D WAVE 4 OF 4 - CLOSES PHASE D).
  // 16 actions + sla_breached. Aggregator stitching W127/W128/W129 vs
  // emulated NTT IoT/O&M baseline. SIGNATURE: recall_certification
  // crosses regulator EVERY tier (W130-NCB-RECALL hard line -
  // withdrawal of a published savings cert is ALWAYS reportable).
  | 'ntt_comparison_battery_cycle_proposed'
  | 'ntt_comparison_battery_baselines_synced'
  | 'ntt_comparison_battery_telemetry_window_bound'
  | 'ntt_comparison_battery_ntt_emulation_run'
  | 'ntt_comparison_battery_champion_predictions_collected'
  | 'ntt_comparison_battery_counterfactuals_computed'
  | 'ntt_comparison_battery_revenue_weighted_scored'
  | 'ntt_comparison_battery_significance_tested'
  | 'ntt_comparison_battery_savings_certified'
  | 'ntt_comparison_battery_audit_published'
  | 'ntt_comparison_battery_retraining_triggered'
  | 'ntt_comparison_battery_archived'
  | 'ntt_comparison_battery_significance_failed'
  | 'ntt_comparison_battery_rolled_back'
  | 'ntt_comparison_battery_recalled'
  | 'ntt_comparison_battery_failover_to_prior_cycle'
  | 'ntt_comparison_battery_sla_breached'
  // W131 Stage Gates (DG0-DG4) — PHASE E WAVE 1 OF N.
  // 12-state P6 on oe_stage_gates; INVERTED SLA (low_capex 168h ->
  // equator_cat_a 2160h). SIGNATURE: reject_gate EVERY tier
  // (project termination universally reportable to NERSA + DMRE;
  // REIPPPP bid death IS the reportable event; sister of W127 rollback).
  // record_decision DG4 EVERY tier (NERSA Section 14 licence crossing).
  // JOINS existing 'ipp' audit namespace.
  | 'stage_gate.proposed'
  | 'stage_gate.evidence_compiled'
  | 'stage_gate.ie_reviewed'
  | 'stage_gate.lender_reviewed'
  | 'stage_gate.board_briefing_circulated'
  | 'stage_gate.cab_held'
  | 'stage_gate.conditions_set'
  | 'stage_gate.decision_recorded'
  | 'stage_gate.conditions_satisfied'
  | 'stage_gate.gate_passed'
  | 'stage_gate.notified_downstream'
  | 'stage_gate.archived'
  | 'stage_gate.gate_deferred'
  | 'stage_gate.gate_withdrawn'
  | 'stage_gate.gate_rejected'
  | 'stage_gate.conditional_pass'
  | 'stage_gate.sla_breached'
  // W132 IPP Issues Log — PHASE E WAVE 2 OF N.
  // 12-state P6 on oe_ipp_issues; URGENT SLA (P1=24h tightest).
  // SIGNATURE: escalate_to_regulator EVERY tier when safety OR regulatory
  // (OHSA s24 + ERA s35 notifiable event always reportable).
  // close EVERY tier when is_nersa_notifiable. SLA breach P1+P2 safety/reg.
  // JOINS existing 'ipp' audit namespace.
  | 'ipp_issue.raised'
  | 'ipp_issue.triaged'
  | 'ipp_issue.assigned'
  | 'ipp_issue.acknowledged'
  | 'ipp_issue.in_progress'
  | 'ipp_issue.blocked'
  | 'ipp_issue.unblocked'
  | 'ipp_issue.under_review'
  | 'ipp_issue.resolved'
  | 'ipp_issue.verified'
  | 'ipp_issue.evidence_filed'
  | 'ipp_issue.closed'
  | 'ipp_issue.archived'
  | 'ipp_issue.escalated'
  | 'ipp_issue.deferred'
  | 'ipp_issue.cancelled'
  | 'ipp_issue.sla_breached'
  // W133 IPP Risk Register — PHASE E WAVE 3 OF N.
  // 11-state P6 on oe_ipp_risks; INVERTED SLA (catastrophic 2160h most time).
  // SIGNATURE: escalate_risk EVERY tier when safety AND (critical|catastrophic).
  // flag_triggered catastrophic EVERY tier (universal hard line).
  // JOINS existing 'ipp' audit namespace.
  | 'ipp_risk.identified'
  | 'ipp_risk.assessed'
  | 'ipp_risk.quantified'
  | 'ipp_risk.response_planned'
  | 'ipp_risk.owner_assigned'
  | 'ipp_risk.monitoring'
  | 'ipp_risk.triggered'
  | 'ipp_risk.responding'
  | 'ipp_risk.outcome_recorded'
  | 'ipp_risk.closed'
  | 'ipp_risk.archived'
  | 'ipp_risk.escalated'
  | 'ipp_risk.deferred'
  | 'ipp_risk.reactivated'
  | 'ipp_risk.cancelled'
  | 'ipp_risk.sla_breached'
  // W134 IPP Stakeholder Register — PHASE E WAVE 4 OF N.
  // 12-state P6 on oe_ipp_stakeholders; URGENT SLA (strategic_ally 24h TIGHTEST).
  // SIGNATURE: escalate_engagement EVERY tier (universally reportable).
  // flag_resistant EVERY tier when power_score >= 4 (REIPPPP S4 community-participation risk).
  // JOINS existing 'ipp' audit namespace.
  | 'ipp_stakeholder.analyze_stakeholder'
  | 'ipp_stakeholder.classify_stakeholder'
  | 'ipp_stakeholder.plan_engagement'
  | 'ipp_stakeholder.activate_engagement'
  | 'ipp_stakeholder.record_response'
  | 'ipp_stakeholder.confirm_supportive'
  | 'ipp_stakeholder.elevate_to_champion'
  | 'ipp_stakeholder.flag_resistant'
  | 'ipp_stakeholder.flag_disengaged'
  | 'ipp_stakeholder.escalate_engagement'
  | 'ipp_stakeholder.re_engage'
  | 'ipp_stakeholder.archive_stakeholder'
  | 'ipp_stakeholder.sla_breached'
  // W135 IPP Lessons Learned Register — PHASE E WAVE 5 OF N.
  // 13-state P6 on oe_ipp_lessons_learned; INVERTED SLA (critical_impact 720h MOST time).
  // SIGNATURE: disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1.
  // PMBOK 7 / ISO 21502:2022 §12.6 dissemination tracking.
  // JOINS existing 'ipp' audit namespace.
  | 'ipp_lessons_learned.categorize_lesson'
  | 'ipp_lessons_learned.analyze_root_cause'
  | 'ipp_lessons_learned.assess_impact'
  | 'ipp_lessons_learned.draft_recommendation'
  | 'ipp_lessons_learned.submit_for_review'
  | 'ipp_lessons_learned.approve_lesson'
  | 'ipp_lessons_learned.disseminate_finding'
  | 'ipp_lessons_learned.confirm_applied'
  | 'ipp_lessons_learned.archive_lesson'
  | 'ipp_lessons_learned.reject_lesson'
  | 'ipp_lessons_learned.defer_lesson'
  | 'ipp_lessons_learned.mark_duplicate'
  | 'ipp_lessons_learned.restore_lesson'
  | 'ipp_ncr.acknowledge_ncr'
  | 'ipp_ncr.start_investigation'
  | 'ipp_ncr.propose_disposition'
  | 'ipp_ncr.review_disposition'
  | 'ipp_ncr.start_rework'
  | 'ipp_ncr.submit_reinspection'
  | 'ipp_ncr.plan_corrective_action'
  | 'ipp_ncr.close_ncr'
  | 'ipp_ncr.accept_as_is'
  | 'ipp_ncr.reject_escalate'
  | 'ipp_ncr.void_ncr'
  | 'ipp_ncr.flag_overdue'
  // W137 IPP Method Statement (SWMS) Management — OHSA Const.Reg.7 + EP4
  // URGENT SLA: high_risk 24h (tightest) → routine 336h (loosest)
  // SIGNATURE: approve_ms EVERY tier when is_critical_lift OR is_confined_space OR is_live_electrical
  //            suspend_work crosses when floor_regulatory_notification
  | 'ipp_method_statement.submit_for_review'
  | 'ipp_method_statement.complete_risk_assessment'
  | 'ipp_method_statement.approve_ms'
  | 'ipp_method_statement.conduct_toolbox_talk'
  | 'ipp_method_statement.commence_work'
  | 'ipp_method_statement.complete_work'
  | 'ipp_method_statement.close_ms'
  | 'ipp_method_statement.archive_ms'
  | 'ipp_method_statement.reject_ms'
  | 'ipp_method_statement.supersede_ms'
  | 'ipp_method_statement.suspend_work'
  | 'ipp_method_statement.resume_work'
  | 'ipp_method_statement.flag_overdue'
  // Wave 138 — IPP Environmental Monitoring Log (NEMA s30 + DFFE EIA + ISO 14001)
  | 'ipp_env_monitoring.start_sampling'
  | 'ipp_env_monitoring.submit_sample'
  | 'ipp_env_monitoring.record_results'
  | 'ipp_env_monitoring.assess_compliance'
  | 'ipp_env_monitoring.draft_report'
  | 'ipp_env_monitoring.submit_report'
  | 'ipp_env_monitoring.close_monitoring'
  | 'ipp_env_monitoring.flag_exceedance'
  | 'ipp_env_monitoring.initiate_corrective_action'
  | 'ipp_env_monitoring.investigate_exceedance'
  | 'ipp_env_monitoring.resolve_corrective_action'
  | 'ipp_env_monitoring.cancel_monitoring'
  | 'ipp_env_monitoring.flag_overdue'
  // ─── Wave 139: IPP Material Inspection Record (MIR) ──────────────────────
  // ISO 9001:2015 §8.6 + REIPPPP + EP4; 12-state P6 on oe_ipp_mirs.
  // URGENT SLA (critical_structural 24h TIGHTEST → general 168h).
  // SIGNATURE: reject_material EVERY tier when IE witnessed;
  //            quarantine_material EVERY tier when floor_critical_safety.
  | 'ipp_mir.record_delivery'
  | 'ipp_mir.start_initial_inspection'
  | 'ipp_mir.proceed_to_detailed'
  | 'ipp_mir.take_test_samples'
  | 'ipp_mir.await_results'
  | 'ipp_mir.approve_material'
  | 'ipp_mir.approve_conditional'
  | 'ipp_mir.incorporate_material'
  | 'ipp_mir.reject_material'
  | 'ipp_mir.quarantine_material'
  | 'ipp_mir.return_to_supplier'
  | 'ipp_mir.flag_overdue'
  // ─── Wave 140: IPP Subcontractor Management ───────────────────────────────
  // OHSA Construction Regs 2014 Reg.6 + ISO 45001:2018 + REIPPPP ED + EP4; 12-state P6.
  // URGENT SLA (critical_trade 24h TIGHTEST → labor_only 168h).
  // SIGNATURE: terminate_subcontractor EVERY tier when safety_violation;
  //            suspend_subcontractor when floor_ohsa_notification;
  //            close_subcontract when floor_lender_escrow_release.
  | 'ipp_subcontractor.start_prequalification'
  | 'ipp_subcontractor.complete_induction'
  | 'ipp_subcontractor.mobilize'
  | 'ipp_subcontractor.commence_work'
  | 'ipp_subcontractor.trigger_review'
  | 'ipp_subcontractor.confirm_good_standing'
  | 'ipp_subcontractor.return_to_performing'
  | 'ipp_subcontractor.complete_work'
  | 'ipp_subcontractor.demobilize'
  | 'ipp_subcontractor.close_subcontract'
  | 'ipp_subcontractor.suspend_subcontractor'
  | 'ipp_subcontractor.terminate_subcontractor'
  | 'ipp_subcontractor.reinstate_subcontractor'
  | 'ipp_subcontractor.flag_overdue'
  // W141 IPP Progress Claims & Payment Certificates
  | 'ipp_progress_claim.commence_qs_review'
  | 'ipp_progress_claim.complete_qs_review'
  | 'ipp_progress_claim.certify_by_engineer'
  | 'ipp_progress_claim.approve_payment'
  | 'ipp_progress_claim.process_payment'
  | 'ipp_progress_claim.close_claim'
  | 'ipp_progress_claim.dispute_claim'
  | 'ipp_progress_claim.resolve_dispute'
  | 'ipp_progress_claim.suspend_payment'
  | 'ipp_progress_claim.reinstate_payment'
  | 'ipp_progress_claim.reject_claim'
  | 'ipp_progress_claim.approve_partial'
  | 'ipp_progress_claim.record_final_account'
  | 'ipp_progress_claim.flag_overdue'
  // W142 IPP Technical Query (TQ) Log
  | 'ipp_tq.log_tq'
  | 'ipp_tq.allocate_to_designer'
  | 'ipp_tq.commence_review'
  | 'ipp_tq.draft_response'
  | 'ipp_tq.approve_response'
  | 'ipp_tq.issue_response'
  | 'ipp_tq.acknowledge_response'
  | 'ipp_tq.close_tq'
  | 'ipp_tq.reject_tq'
  | 'ipp_tq.flag_design_change'
  | 'ipp_tq.escalate_tq'
  | 'ipp_tq.resolve_escalation'
  | 'ipp_tq.flag_overdue'
  // ─── W143 IPP Daily Construction Diary ───────────────────────────────────
  | 'ipp_diary.submit_diary' | 'ipp_diary.note_receipt' | 'ipp_diary.ie_review'
  | 'ipp_diary.countersign' | 'ipp_diary.archive_diary' | 'ipp_diary.dispute_diary'
  | 'ipp_diary.open_resolution' | 'ipp_diary.accept_correction'
  | 'ipp_diary.miss_diary' | 'ipp_diary.flag_late' | 'ipp_diary.void_diary'
  | 'ipp_diary.flag_sla_breach'
  // ─── W144 IPP Site/Engineer's Instruction ────────────────────────────────────
  | 'ipp_si.issue_instruction' | 'ipp_si.acknowledge_receipt' | 'ipp_si.commence_work'
  | 'ipp_si.request_extension' | 'ipp_si.grant_extension' | 'ipp_si.complete_work'
  | 'ipp_si.ie_verify' | 'ipp_si.close_instruction' | 'ipp_si.dispute_instruction'
  | 'ipp_si.resolve_dispute' | 'ipp_si.supersede_instruction' | 'ipp_si.void_instruction'
  | 'ipp_si.flag_sla_breach'
  // ─── W145 IPP DLP Defects Register ──────────────────────────────────────────
  | 'ipp_dlp.notify_defect' | 'ipp_dlp.acknowledge_receipt' | 'ipp_dlp.start_rectification'
  | 'ipp_dlp.request_extension' | 'ipp_dlp.grant_extension' | 'ipp_dlp.submit_rectified'
  | 'ipp_dlp.ie_accept' | 'ipp_dlp.ie_reject' | 'ipp_dlp.close_defect'
  | 'ipp_dlp.dispute_rectification' | 'ipp_dlp.resolve_dispute' | 'ipp_dlp.waive_defect'
  | 'ipp_dlp.cancel_defect' | 'ipp_dlp.flag_sla_breach'
  // ─── W146: IPP Variation Orders ─────────────────────────────────────────────
  | 'ipp_vo.instructed' | 'ipp_vo.acknowledge_instruction' | 'ipp_vo.submit_quotation'
  | 'ipp_vo.review_quotation' | 'ipp_vo.approve_variation' | 'ipp_vo.reject_variation'
  | 'ipp_vo.commence_work' | 'ipp_vo.complete_work' | 'ipp_vo.certify_payment'
  | 'ipp_vo.dispute_pricing' | 'ipp_vo.resolve_dispute' | 'ipp_vo.refer_adjudication'
  | 'ipp_vo.cancel_instruction' | 'ipp_vo.sla_breached' | 'ipp_vo.flag_sla_breach'
  // ─── W147: IPP Payment Certificates ────────────────────────────────────────
  | 'ipp_pc.created' | 'ipp_pc.submit_claim' | 'ipp_pc.assess_claim'
  | 'ipp_pc.certify_payment' | 'ipp_pc.confirm_payment' | 'ipp_pc.certify_final'
  | 'ipp_pc.dispute_certificate' | 'ipp_pc.revise_certificate' | 'ipp_pc.refer_adjudication'
  | 'ipp_pc.reject_claim' | 'ipp_pc.withdraw_claim' | 'ipp_pc.mark_lapsed'
  | 'ipp_pc.sla_breached' | 'ipp_pc.flag_sla_breach'
  // ─── W148 Final Completion Certificate
  | 'ipp_fcc.application_submitted' | 'ipp_fcc.schedule_inspection' | 'ipp_fcc.complete_inspection'
  | 'ipp_fcc.issue_snag_list' | 'ipp_fcc.clear_snag_list' | 'ipp_fcc.issue_fcc'
  | 'ipp_fcc.release_retention' | 'ipp_fcc.reject_application' | 'ipp_fcc.dispute_rejection'
  | 'ipp_fcc.refer_adjudication' | 'ipp_fcc.withdraw_application'
  | 'ipp_fcc.sla_breached' | 'ipp_fcc.flag_sla_breach'
  // ─── W149 O&M Handover Pack
  | 'ipp_omh.created' | 'ipp_omh.submit_for_internal_review' | 'ipp_omh.approve_internal'
  | 'ipp_omh.submit_to_om' | 'ipp_omh.raise_deficiencies' | 'ipp_omh.resolve_deficiencies'
  | 'ipp_omh.accept_handover' | 'ipp_omh.conditionally_accept' | 'ipp_omh.reject_handover'
  | 'ipp_omh.supersede' | 'ipp_omh.archive' | 'ipp_omh.withdraw'
  | 'ipp_omh.sla_breached' | 'ipp_omh.flag_sla_breach'
  // ─── W150 As-Built Survey & Land Register
  | 'ipp_lr.survey_commissioned' | 'ipp_lr.commence_field_survey' | 'ipp_lr.submit_diagram'
  | 'ipp_lr.sg_approve' | 'ipp_lr.notarise_servitude' | 'ipp_lr.lodge_deeds'
  | 'ipp_lr.confirm_registration' | 'ipp_lr.raise_defective_title' | 'ipp_lr.resolve_defective_title'
  | 'ipp_lr.reject_survey' | 'ipp_lr.abandon' | 'ipp_lr.supersede'
  | 'ipp_lr.sla_breached' | 'ipp_lr.flag_sla_breach'
  // ─── IPP Env Closure (W151) ──────────────────────────────────────────────
  | 'ipp_ec.created' | 'ipp_ec.commence_inspection' | 'ipp_ec.draft_report'
  | 'ipp_ec.commence_stakeholder_review' | 'ipp_ec.raise_remediation' | 'ipp_ec.confirm_remediation'
  | 'ipp_ec.recommend_closure' | 'ipp_ec.submit_to_nema' | 'ipp_ec.nema_commence_review'
  | 'ipp_ec.issue_closure_cert' | 'ipp_ec.reject_application' | 'ipp_ec.withdraw'
  | 'ipp_ec.sla_breached' | 'ipp_ec.flag_sla_breach'
  // ─── IPP Commissioning Test (W152) ───────────────────────────────────────
  | 'ipp_ct.created' | 'ipp_ct.commence_witness_inspection' | 'ipp_ct.open_hold_point'
  | 'ipp_ct.clear_hold_point' | 'ipp_ct.start_performance_test' | 'ipp_ct.issue_punch_list'
  | 'ipp_ct.clear_punch_list' | 'ipp_ct.recommend_pac' | 'ipp_ct.issue_pac'
  | 'ipp_ct.start_post_pac_test' | 'ipp_ct.recommend_fac' | 'ipp_ct.issue_performance_cert'
  | 'ipp_ct.declare_test_failure' | 'ipp_ct.withdraw'
  | 'ipp_ct.sla_breached' | 'ipp_ct.flag_sla_breach'
  // ─── IPP IE Milestone Certification (W153) ───────────────────────────────
  | 'ipp_ie.created' | 'ipp_ie.commence_site_visit' | 'ipp_ie.prepare_draft'
  | 'ipp_ie.issue_for_borrower_review' | 'ipp_ie.raise_comments' | 'ipp_ie.resolve_comments'
  | 'ipp_ie.issue_cert' | 'ipp_ie.reject_certification' | 'ipp_ie.withdraw'
  | 'ipp_ie.sla_breached' | 'ipp_ie.flag_sla_breach'
  // ─── IPP TPA Wheeling Agreement (W154) ───────────────────────────────────
  | 'ipp_tpa.created' | 'ipp_tpa.commence_review' | 'ipp_tpa.commence_technical_assessment'
  | 'ipp_tpa.propose_commercial_terms' | 'ipp_tpa.commence_negotiation' | 'ipp_tpa.agree_terms'
  | 'ipp_tpa.sign_tpa_agreement' | 'ipp_tpa.activate_wheeling' | 'ipp_tpa.reject_application'
  | 'ipp_tpa.file_appeal' | 'ipp_tpa.determine_appeal' | 'ipp_tpa.withdraw'
  | 'ipp_tpa.sla_breached' | 'ipp_tpa.flag_sla_breach'
  // ─── IPP PPA Variation & Amendment (W155) ────────────────────────────────
  | 'ipp_ppavar.created' | 'ipp_ppavar.commence_screen' | 'ipp_ppavar.submit_technical'
  | 'ipp_ppavar.commence_commercial' | 'ipp_ppavar.open_public_participation'
  | 'ipp_ppavar.close_public_participation' | 'ipp_ppavar.approve_variation'
  | 'ipp_ppavar.amend_ppa' | 'ipp_ppavar.reject_variation' | 'ipp_ppavar.file_appeal'
  | 'ipp_ppavar.determine_appeal' | 'ipp_ppavar.withdraw'
  | 'ipp_ppavar.sla_breached' | 'ipp_ppavar.flag_sla_breach'
  // ─── IPP Change of Control & Ownership (W156) ────────────────────────────
  | 'ipp_coc.created' | 'ipp_coc.commence_completeness' | 'ipp_coc.submit_foreign_screen'
  | 'ipp_coc.commence_competition' | 'ipp_coc.commence_technical'
  | 'ipp_coc.open_public_participation' | 'ipp_coc.close_public_participation'
  | 'ipp_coc.issue_evaluation' | 'ipp_coc.grant_approval' | 'ipp_coc.impose_conditions'
  | 'ipp_coc.transfer_control' | 'ipp_coc.reject_change' | 'ipp_coc.file_appeal'
  | 'ipp_coc.determine_appeal' | 'ipp_coc.withdraw'
  | 'ipp_coc.sla_breached' | 'ipp_coc.flag_sla_breach'
  // ─── IPP Project Refinancing & Debt Restructuring (W157) ─────────────────
  | 'ipp_refi.created' | 'ipp_refi.sign_term_sheet' | 'ipp_refi.submit_credit'
  | 'ipp_refi.satisfy_conditions' | 'ipp_refi.apply_sarb' | 'ipp_refi.obtain_sarb_approval'
  | 'ipp_refi.apply_nersa_clearance' | 'ipp_refi.obtain_nersa_clearance'
  | 'ipp_refi.finalise_documentation' | 'ipp_refi.achieve_financial_close'
  | 'ipp_refi.reject_refinancing' | 'ipp_refi.abandon'
  | 'ipp_refi.declare_lender_default' | 'ipp_refi.resolve_lender_default'
  | 'ipp_refi.sla_breached' | 'ipp_refi.flag_sla_breach'
  // ─── W158: IPP Force Majeure Declaration & Relief ──────────────────────────
  | 'ipp_fm.created' | 'ipp_fm.sla_breached'
  | 'fm_evt_issue_fm_notice' | 'fm_evt_verify_notice' | 'fm_evt_grant_relief'
  | 'fm_evt_commence_monitoring' | 'fm_evt_resolve_event' | 'fm_evt_dispute_claim'
  | 'fm_evt_commence_arbitration' | 'fm_evt_determine_arbitration'
  | 'fm_evt_declare_prolonged' | 'fm_evt_withdraw_claim' | 'fm_evt_flag_sla_breach'
  // W159 IPP Annual Regulatory Compliance Report
  | 'ipp_anr.created' | 'ipp_anr.sla_breached'
  | 'anr_evt_start_drafting' | 'anr_evt_begin_data_collection' | 'anr_evt_complete_data_collection'
  | 'anr_evt_submit_for_internal_review' | 'anr_evt_approve_internally' | 'anr_evt_submit_report'
  | 'anr_evt_commence_review' | 'anr_evt_raise_queries' | 'anr_evt_submit_responses'
  | 'anr_evt_accept_report' | 'anr_evt_reject_report' | 'anr_evt_lodge_appeal'
  | 'anr_evt_determine_appeal' | 'anr_evt_flag_sla_breach'
  // W160 IPP EPC Contractor Default & Termination
  | 'ipp_cd.created' | 'ipp_cd.sla_breached'
  | 'cd_evt_issue_default_notice' | 'cd_evt_acknowledge_cure_period' | 'cd_evt_confirm_default'
  | 'cd_evt_issue_termination_notice' | 'cd_evt_assess_step_in_rights' | 'cd_evt_invoke_step_in_rights'
  | 'cd_evt_initiate_bond_call' | 'cd_evt_commence_handover' | 'cd_evt_award_replacement_contract'
  | 'cd_evt_appoint_replacement' | 'cd_evt_reach_settlement' | 'cd_evt_withdraw_termination'
  | 'cd_evt_flag_sla_breach'
  // W161 IPP Environmental Compliance Audit (ECO Annual Report)
  | 'ipp_eco.created' | 'ipp_eco.sla_breached'
  | 'eco_evt_appoint_eco' | 'eco_evt_commence_site_inspection' | 'eco_evt_complete_site_inspection'
  | 'eco_evt_submit_for_review' | 'eco_evt_submit_report' | 'eco_evt_commence_dffe_review'
  | 'eco_evt_raise_queries' | 'eco_evt_submit_responses' | 'eco_evt_certify_compliant'
  | 'eco_evt_identify_non_compliance' | 'eco_evt_commence_corrective_action'
  | 'eco_evt_refer_to_enforcement' | 'eco_evt_flag_sla_breach'
  // W162 IPP LTA Drawdown Certificate
  | 'ipp_lta.created' | 'ipp_lta.sla_breached'
  | 'lta_evt_schedule_site_inspection' | 'lta_evt_complete_site_inspection'
  | 'lta_evt_issue_draft_certificate' | 'lta_evt_submit_borrower_comments'
  | 'lta_evt_issue_final_certificate' | 'lta_evt_approve_certificate'
  | 'lta_evt_qualify_certificate' | 'lta_evt_resolve_conditions'
  | 'lta_evt_refuse_certificate' | 'lta_evt_raise_appeal'
  | 'lta_evt_determine_appeal' | 'lta_evt_flag_sla_breach'
  // ─── W163: IPP Land Amendment ────────────────────────────────────────────
  | 'ipp_lam.created' | 'ipp_lam.sla_breached'
  | 'lam_evt_appoint_surveyor' | 'lam_evt_complete_survey'
  | 'lam_evt_submit_application' | 'lam_evt_commence_authority_review'
  | 'lam_evt_issue_public_notice' | 'lam_evt_close_objection_period'
  | 'lam_evt_resolve_objections' | 'lam_evt_grant_amendment'
  | 'lam_evt_refuse_amendment' | 'lam_evt_file_appeal'
  | 'lam_evt_determine_appeal' | 'lam_evt_flag_sla_breach'
  // ─── W164: IPP Community Trust ───────────────────────────────────────────
  | 'ipp_ctr.created' | 'ipp_ctr.sla_breached'
  | 'ctr_evt_commence_data_preparation' | 'ctr_evt_submit_to_trustees'
  | 'ctr_evt_complete_trustee_review' | 'ctr_evt_complete_ipp_review'
  | 'ctr_evt_submit_to_dtic' | 'ctr_evt_commence_dtic_review'
  | 'ctr_evt_raise_queries' | 'ctr_evt_submit_responses'
  | 'ctr_evt_accept_report' | 'ctr_evt_reject_report'
  | 'ctr_evt_file_appeal' | 'ctr_evt_determine_appeal'
  | 'ctr_evt_flag_sla_breach'
  // ─── W165: IPP Grid Code Compliance Self-Assessment ──────────────────────
  | 'ipp_gcc.created' | 'ipp_gcc.sla_breached'
  | 'gcc_evt_commence_preparation' | 'gcc_evt_commence_testing'
  | 'gcc_evt_complete_testing' | 'gcc_evt_draft_report'
  | 'gcc_evt_submit_to_nersa' | 'gcc_evt_commence_nersa_review'
  | 'gcc_evt_note_deficiency' | 'gcc_evt_commence_corrective_action'
  | 'gcc_evt_submit_for_verification' | 'gcc_evt_certify_compliant'
  | 'gcc_evt_issue_non_compliance' | 'gcc_evt_flag_sla_breach'
  // ─── W166: IPP CCC Negotiation ───────────────────────────────────────────
  | 'ipp_ccc.created' | 'ipp_ccc.sla_breached'
  | 'ccc_evt_commission_load_flow_study' | 'ccc_evt_complete_cost_assessment'
  | 'ccc_evt_submit_for_ipp_review' | 'ccc_evt_commence_negotiation'
  | 'ccc_evt_refer_to_expert' | 'ccc_evt_accept_expert_determination'
  | 'ccc_evt_reach_provisional_agreement' | 'ccc_evt_file_dispute'
  | 'ccc_evt_commence_arbitration' | 'ccc_evt_agree_ccc'
  | 'ccc_evt_reject_ccc' | 'ccc_evt_refer_to_nersa'
  | 'ccc_evt_flag_sla_breach'
  // ─── W167: IPP O&M Contract Renewal ─────────────────────────────────────
  | 'ipp_omc.created' | 'ipp_omc.sla_breached'
  | 'omc_evt_commence_market_sounding' | 'omc_evt_issue_tender'
  | 'omc_evt_close_bids' | 'omc_evt_complete_evaluation'
  | 'omc_evt_select_preferred_bidder' | 'omc_evt_obtain_lender_consent'
  | 'omc_evt_obtain_nersa_acknowledgement' | 'omc_evt_execute_contract'
  | 'omc_evt_declare_renewal_failed' | 'omc_evt_trigger_novation'
  | 'omc_evt_execute_novation' | 'omc_evt_flag_sla_breach'
  // ─── W168: IPP BFS Re-certification ─────────────────────────────────────
  | 'ipp_bfs.created' | 'ipp_bfs.sla_breached'
  | 'bfs_evt_define_scope' | 'bfs_evt_commence_data_collection'
  | 'bfs_evt_commence_analysis' | 'bfs_evt_issue_draft_bfs'
  | 'bfs_evt_commence_peer_review' | 'bfs_evt_submit_ipp_comments'
  | 'bfs_evt_submit_to_ie' | 'bfs_evt_raise_queries'
  | 'bfs_evt_submit_responses' | 'bfs_evt_certify_bfs'
  | 'bfs_evt_reject_bfs' | 'bfs_evt_flag_sla_breach'
  // ─── W169: EA Amendment ───────────────────────────────────────────────────
  | 'ipp_eam.created' | 'ipp_eam.sla_breached'
  | 'eam_evt_define_scope' | 'eam_evt_prepare_application'
  | 'eam_evt_submit_application' | 'eam_evt_accept_for_review'
  | 'eam_evt_open_public_participation' | 'eam_evt_close_public_participation'
  | 'eam_evt_submit_specialist_review' | 'eam_evt_commence_final_review'
  | 'eam_evt_grant_amendment' | 'eam_evt_refuse_amendment'
  | 'eam_evt_refer_s24g' | 'eam_evt_flag_sla_breach'
  // ─── W170: WUL ───────────────────────────────────────────────────────────
  | 'ipp_wul.created' | 'ipp_wul.sla_breached'
  | 'wul_evt_commence_site_assessment' | 'wul_evt_commence_application_preparation'
  | 'wul_evt_submit_application' | 'wul_evt_accept_for_review'
  | 'wul_evt_open_public_participation' | 'wul_evt_close_public_participation'
  | 'wul_evt_commence_technical_assessment' | 'wul_evt_commence_final_review'
  | 'wul_evt_grant_wul' | 'wul_evt_refuse_wul'
  | 'wul_evt_lapse_wul' | 'wul_evt_flag_sla_breach'
  // ─── W171: HRA ───────────────────────────────────────────────────────────
  | 'ipp_hra.created' | 'ipp_hra.sla_breached'
  | 'hra_evt_commence_desktop_study' | 'hra_evt_commence_field_survey'
  | 'hra_evt_prepare_hra_report' | 'hra_evt_submit_hra'
  | 'hra_evt_commence_sahra_review' | 'hra_evt_open_public_participation'
  | 'hra_evt_commence_specialist_assessment' | 'hra_evt_commence_final_review'
  | 'hra_evt_approve_hra' | 'hra_evt_refuse_hra'
  | 'hra_evt_add_to_watchlist' | 'hra_evt_flag_sla_breach'
  // ─── W172: AEL ───────────────────────────────────────────────────────────
  | 'ipp_ael.created' | 'ipp_ael.sla_breached'
  | 'ael_evt_commence_emissions_inventory' | 'ael_evt_prepare_application'
  | 'ael_evt_submit_application' | 'ael_evt_accept_for_review'
  | 'ael_evt_open_public_participation' | 'ael_evt_close_public_participation'
  | 'ael_evt_commence_technical_assessment' | 'ael_evt_commence_final_review'
  | 'ael_evt_grant_ael' | 'ael_evt_refuse_ael'
  | 'ael_evt_lapse_ael' | 'ael_evt_flag_sla_breach'
  // ─── W173: Force Majeure Relief Claim ───────────────────────────────────
  | 'ipp_fmr.created' | 'ipp_fmr.sla_breached'
  | 'fmr_evt_issue_fm_notice' | 'fmr_evt_receive_acknowledgment'
  | 'fmr_evt_request_ie_assessment' | 'fmr_evt_commence_ie_assessment'
  | 'fmr_evt_issue_ie_report' | 'fmr_evt_quantify_relief'
  | 'fmr_evt_commence_negotiation' | 'fmr_evt_confirm_relief'
  | 'fmr_evt_refuse_relief' | 'fmr_evt_declare_arbitration'
  | 'fmr_evt_flag_sla_breach'
  // ─── W174: IPP LC/SED Quarterly Compliance ──────────────────────────────────
  | 'ipp_lcr.created' | 'ipp_lcr.sla_breached'
  | 'lcr_evt_commence_collection' | 'lcr_evt_submit_for_verification'
  | 'lcr_evt_prepare_report' | 'lcr_evt_submit_report'
  | 'lcr_evt_accept_for_review' | 'lcr_evt_request_clarification'
  | 'lcr_evt_submit_clarification' | 'lcr_evt_commence_technical_assessment'
  | 'lcr_evt_confirm_compliant' | 'lcr_evt_confirm_non_compliance'
  | 'lcr_evt_grant_conditional_compliance' | 'lcr_evt_flag_sla_breach'
  // ─── W175: IPP REIPPPP Milestone Certification ──────────────────────────────
  | 'ipp_mc.created' | 'ipp_mc.sla_breached'
  | 'mc_evt_commence_documentation' | 'mc_evt_submit_for_ie_review'
  | 'mc_evt_submit_to_ipp_office' | 'mc_evt_acknowledge_receipt'
  | 'mc_evt_commence_technical_verification' | 'mc_evt_request_clarification'
  | 'mc_evt_submit_clarification' | 'mc_evt_commence_final_review'
  | 'mc_evt_certify_milestone' | 'mc_evt_reject_milestone'
  | 'mc_evt_lapse_milestone' | 'mc_evt_flag_sla_breach'
  // ─── W176: IPP DFI E&S Monitoring Report (Equator Principles) ───────────────
  | 'ipp_esmr.created' | 'ipp_esmr.sla_breached'
  | 'esmr_evt_commence_data_collection' | 'esmr_evt_compile_monitoring_report'
  | 'esmr_evt_commence_ta_review' | 'esmr_evt_prepare_ta_report'
  | 'esmr_evt_submit_report' | 'esmr_evt_commence_lender_review'
  | 'esmr_evt_request_clarification' | 'esmr_evt_submit_clarification'
  | 'esmr_evt_issue_certificate' | 'esmr_evt_withhold_certificate'
  | 'esmr_evt_declare_material_breach' | 'esmr_evt_flag_sla_breach'
  // ─── W177: IPP IE Annual Performance Review ──────────────────────────────────
  | 'ipp_iear.created' | 'ipp_iear.sla_breached'
  | 'iear_evt_define_scope' | 'iear_evt_submit_data'
  | 'iear_evt_commence_field_inspection' | 'iear_evt_commence_analysis'
  | 'iear_evt_issue_draft_report' | 'iear_evt_submit_ipp_response'
  | 'iear_evt_commence_final_review' | 'iear_evt_issue_report'
  | 'iear_evt_close_review' | 'iear_evt_require_remediation'
  | 'iear_evt_escalate_to_lenders' | 'iear_evt_flag_sla_breach'
  // ─── W178: IPP Annual Insurance Renewal ──────────────────────────────────────
  | 'ipp_insr.created' | 'ipp_insr.sla_breached'
  | 'insr_evt_commence_gap_analysis' | 'insr_evt_instruct_broker'
  | 'insr_evt_place_in_market' | 'insr_evt_receive_terms'
  | 'insr_evt_commence_lender_review' | 'insr_evt_prepare_documentation'
  | 'insr_evt_submit_documents' | 'insr_evt_request_lender_confirmation'
  | 'insr_evt_confirm_adequate' | 'insr_evt_confirm_inadequate'
  | 'insr_evt_lapse_coverage' | 'insr_evt_flag_sla_breach'
  // ─── W179 IPP Performance Security / Construction Guarantee Renewal ─────────
  | 'ipp_psec.created' | 'ipp_psec.sla_breached'
  | 'psec_evt_submit_application' | 'psec_evt_commence_bank_assessment'
  | 'psec_evt_issue_terms' | 'psec_evt_commence_ipp_review'
  | 'psec_evt_accept_terms' | 'psec_evt_prepare_bond_documentation'
  | 'psec_evt_issue_bond' | 'psec_evt_send_dmre_notification'
  | 'psec_evt_confirm_security' | 'psec_evt_reject_security'
  | 'psec_evt_lapse_security' | 'psec_evt_flag_sla_breach'
  // ─── W180 IPP REIPPPP Community Equity Participation Compliance ─────────────
  | 'ipp_cep.created' | 'ipp_cep.sla_breached'
  | 'cep_evt_identify_stakeholders' | 'cep_evt_calculate_distributions'
  | 'cep_evt_obtain_trustee_approval' | 'cep_evt_prepare_payments'
  | 'cep_evt_confirm_distributions_paid' | 'cep_evt_verify_community_dev'
  | 'cep_evt_compile_documentation' | 'cep_evt_submit_to_dmre'
  | 'cep_evt_confirm_compliant' | 'cep_evt_declare_non_compliant'
  | 'cep_evt_lapse_cep' | 'cep_evt_flag_sla_breach'
  // ─── W181 IPP REIPPPP SED Annual Spend Compliance ───────────────────────────
  | 'ipp_sed.created' | 'ipp_sed.sla_breached'
  | 'sed_evt_identify_beneficiaries' | 'sed_evt_plan_programme'
  | 'sed_evt_obtain_board_approval' | 'sed_evt_execute_spend'
  | 'sed_evt_verify_expenditure' | 'sed_evt_commence_audit'
  | 'sed_evt_complete_audit' | 'sed_evt_submit_to_dmre'
  | 'sed_evt_confirm_compliant' | 'sed_evt_declare_non_compliant'
  | 'sed_evt_lapse_sed' | 'sed_evt_flag_sla_breach'
  // ─── W182 IPP REIPPPP BBBEE Annual Compliance Verification ──────────────────
  | 'ipp_bbbee.created' | 'ipp_bbbee.sla_breached'
  | 'bbbee_evt_prepare_documentation' | 'bbbee_evt_engage_agency'
  | 'bbbee_evt_submit_data' | 'bbbee_evt_commence_assessment'
  | 'bbbee_evt_issue_preliminary_score' | 'bbbee_evt_commence_ipp_review'
  | 'bbbee_evt_commence_final_assessment' | 'bbbee_evt_issue_certificate'
  | 'bbbee_evt_confirm_verified' | 'bbbee_evt_declare_non_compliant'
  | 'bbbee_evt_lapse_certificate' | 'bbbee_evt_flag_sla_breach'
  // ─── W183 IPP Lender Information Covenant & Reporting Package ───────────────
  | 'ipp_lrep.created' | 'ipp_lrep.sla_breached'
  | 'lrep_evt_commence_data_collection' | 'lrep_evt_update_financial_model'
  | 'lrep_evt_conduct_technical_review' | 'lrep_evt_compile_documents'
  | 'lrep_evt_obtain_ipp_sign_off' | 'lrep_evt_submit_to_agent_bank'
  | 'lrep_evt_distribute_to_lenders' | 'lrep_evt_request_acknowledgement'
  | 'lrep_evt_confirm_acknowledged' | 'lrep_evt_raise_dispute'
  | 'lrep_evt_declare_covenant_breach' | 'lrep_evt_flag_sla_breach'
  // ─── W184: IPP Annual NERSA Licence Compliance Return ──────────────────────
  | 'ipp_acr.created' | 'ipp_acr.sla_breached'
  | 'acr_evt_commence_data_assembly' | 'acr_evt_conduct_internal_review'
  | 'acr_evt_obtain_board_approval' | 'acr_evt_submit_to_portal'
  | 'acr_evt_confirm_receipt' | 'acr_evt_begin_nersa_review'
  | 'acr_evt_request_clarification' | 'acr_evt_submit_clarification'
  | 'acr_evt_accept_return' | 'acr_evt_reject_return'
  | 'acr_evt_declare_lapsed' | 'acr_evt_flag_sla_breach'
  // ─── W185: IPP REIPPPP Annual Progress & Compliance Report ─────────────────
  | 'ipp_rpr.created' | 'ipp_rpr.sla_breached'
  | 'rpr_evt_commence_data_collection' | 'rpr_evt_verify_local_content'
  | 'rpr_evt_reconcile_ed_spend' | 'rpr_evt_tabulate_jobs'
  | 'rpr_evt_conduct_internal_review' | 'rpr_evt_obtain_board_approval'
  | 'rpr_evt_submit_to_ipp_office' | 'rpr_evt_confirm_acknowledgement'
  | 'rpr_evt_accept_report' | 'rpr_evt_reject_report'
  | 'rpr_evt_declare_lapsed' | 'rpr_evt_flag_sla_breach'
  // ─── W186: IPP SPV Equity Transfer & NERSA Consent ──────────────────────────
  | 'ipp_eqt.created' | 'ipp_eqt.sla_breached'
  | 'eqt_evt_commence_due_diligence' | 'eqt_evt_notify_regulators'
  | 'eqt_evt_request_lender_consent' | 'eqt_evt_notify_offtaker'
  | 'eqt_evt_commence_nersa_review' | 'eqt_evt_issue_regulatory_clearance'
  | 'eqt_evt_track_conditions_precedent' | 'eqt_evt_submit_cp_documentation'
  | 'eqt_evt_complete_transfer' | 'eqt_evt_reject_transfer'
  | 'eqt_evt_declare_lapsed' | 'eqt_evt_flag_sla_breach'
  // ─── Wave 187 — IPP DMRE Quarterly Generation & Operations Report ─────────
  | 'ipp_qgr.created' | 'ipp_qgr.sla_breached'
  | 'qgr_evt_commence_operations_collection' | 'qgr_evt_compile_environmental_data'
  | 'qgr_evt_compile_financial_data' | 'qgr_evt_tabulate_social_indicators'
  | 'qgr_evt_conduct_internal_review' | 'qgr_evt_obtain_board_approval'
  | 'qgr_evt_submit_to_ipp_office' | 'qgr_evt_confirm_acknowledgement'
  | 'qgr_evt_accept_report' | 'qgr_evt_reject_report'
  | 'qgr_evt_declare_lapsed' | 'qgr_evt_flag_sla_breach'
  // ─── Wave 188 — IPP Annual Grid Code Compliance Self-Assessment ───────────
  | 'ipp_acs.created' | 'ipp_acs.sla_breached'
  | 'acs_evt_commence_protection_audit' | 'acs_evt_commence_metering_scada_audit'
  | 'acs_evt_commence_reactive_power_audit' | 'acs_evt_commence_frequency_response_audit'
  | 'acs_evt_commence_frt_pq_audit' | 'acs_evt_conduct_internal_technical_review'
  | 'acs_evt_submit_to_so' | 'acs_evt_commence_so_review'
  | 'acs_evt_accept_assessment' | 'acs_evt_issue_deficiency_notice'
  | 'acs_evt_declare_lapsed' | 'acs_evt_flag_sla_breach'
  // ─── RBAC ──────────────────────────────────────────────────────────────────
  | 'rbac.registration_submitted' | 'rbac.registration_approved' | 'rbac.registration_rejected'
  | 'rbac.invitation_created' | 'rbac.invitation_revoked'
  | 'rbac.profile_updated' | 'rbac.user_updated'
  // ─── Onboarding ─────────────────────────────────────────────────────────
  | 'onboarding.completed' | 'onboarding.skipped'
  // ─── Esums data sources ──────────────────────────────────────────────────
  | 'esums.data_source.created';

interface CascadeContext {
  event: EventType;
  actor_id?: string;
  entity_type: string;
  entity_id: string;
  data?: Record<string, unknown>;
  env: any;
  /**
   * Opt-out of the auto-audit-chain append. Set to true when the caller has
   * already invoked appendAudit() with a hand-shaped payload (e.g. for
   * tamper-evident state machines where the payload needs to capture more
   * than ctx.data — see trading.ts /orders, settlement /payments, etc.).
   * Default false → every cascade fires through the audit chain.
   */
  skipAudit?: boolean;
}

// Map cascade event prefix → audit-chain entity_type. Anything not in this
// map gets audited under the catch-all 'platform' chain. The point of the
// L5 auto-audit hook is that every domain mutation lands somewhere on a
// chain by default; explicit appendAudit() calls in routes layer on richer
// payloads where needed.
const AUDIT_PREFIX_MAP: Record<string, string> = {
  trade: 'trading',
  invoice: 'settlement',
  dispute: 'settlement',
  settlement: 'settlement',
  escrow: 'settlement',
  carbon: 'carbon',
  carbon_poa: 'carbon',
  carbon_issuance: 'carbon',
  ccp_assessment: 'carbon',
  rec: 'offtaker',
  rec_market: 'offtaker',
  scope2: 'offtaker',
  ipp: 'ipp',
  project: 'ipp',
  project_risk: 'ipp',
  esg: 'esg',
  grid: 'grid',
  metering: 'grid',
  ona: 'ipp',
  pipeline: 'ipp',
  dealroom: 'ipp',
  thread: 'ipp',
  contract: 'contracts',
  marketplace: 'marketplace',
  regulator: 'regulator',
  regulator_levy: 'regulator',
  consultation_notice: 'regulator',
  enforcement_action: 'regulator',
  black_start: 'grid',
  connection_energization: 'grid',
  rez_capacity: 'grid',
  sll_kpi: 'lender',
  settlement_fail: 'trader',
  dscr_monitoring: 'lender',
  ppa_nomination: 'offtaker',
  bess_soh: 'support',
  oem_fco: 'support',
  benchmark_transition: 'trader',
  trade_allocation: 'trading',
  submittal_rfi: 'ipp',
  dfr: 'ipp',
  punch_list: 'ipp',
  itp: 'ipp',
  handover_dossier: 'ipp',
  ppa_annual_recon: 'offtaker',
  soiling_audit: 'esums',
  esg_disclosure: 'carbon',
  service_request: 'support',
  imbalance_settlement: 'grid',
  pretrade_credit: 'trader',
  loan_restructure: 'lender',
  carbon_rating: 'carbon',
  transmission_outage: 'grid',
  pnl_attribution: 'trader',
  ipp_schedule: 'ipp',
  ipp_evm: 'ipp',
  ipp_doc_control: 'ipp',
  ipp_submittal: 'ipp',
  ipp_rfi: 'ipp',
  ipp_change_order: 'ipp',
  popia: 'admin',
  auth: 'auth',
  intelligence: 'admin',
  action_queue: 'admin',
  pcaf: 'carbon',
  maturity: 'carbon',
  anomaly: 'carbon',
  disclosure: 'esg',
  // Wave 118 — non-role-suffixed entry. The W118 cross-chain audit tree
  // gets its own 'audit' chain (NOT 'platform') to distinguish the L5
  // tamper-evident ledger from generic platform-level audit entries.
  audit_chain: 'audit',
  // Wave 119 — Certified Regulator Export Packs. Joins the SAME 'audit'
  // chain as W118 so every pack mutation (propose → blocks_selected → …
  // → lodged → ack/reject) is recorded on the platform-wide tamper-
  // evident ledger spine. Aggregating regulator-relevant W119 events on
  // the audit chain is the whole point of Phase B.
  regulator_export: 'audit',
  // Wave 120 — Reconciliation Attestation. Phase-B wave 3 of 4. Joins
  // the SAME 'audit' chain as W118 + W119 so every attestation mutation
  // (propose → scope_defined → feeds_ingested → blocks_paired → variance
  // → classify → root_cause → remediation → counter_party → review →
  // signed → archived + reject/suspend/resume/restate/escalate-to-AC)
  // is recorded on the platform-wide tamper-evident ledger spine.
  reconciliation_attestation: 'audit',
  // Wave 121 — Control-Environment Audit. FOURTH and FINAL Phase-B wave.
  // Closes Phase B. Joins the SAME 'audit' chain as W118 + W119 + W120
  // so every control evidence dossier mutation (define → design → walk
  // → ToD → ToOE → deficiency → remediation → archive + deficient/
  // excepted/suspended/re-test) is recorded on the platform-wide
  // tamper-evident ledger spine. Fourth non-role-suffixed entry — all
  // four Phase-B chains share the same audit-namespace family.
  control_environment_audit: 'audit',
  // Wave 122 — SCADA / IEC 61850 Substation Connector. PHASE C OPENER.
  // Closes the 'audit' namespace family at W121 and opens the external-
  // system connector family (W122-W126). SCADA connector chains the
  // physical-layer interface between the platform and IPP/grid SCADA
  // stacks (Schneider/Siemens/ABB/GE/Honeywell). Joins the 'grid' chain
  // because every IEC 61850 telemetry batch reads as a grid-domain
  // mutation - explicitly NOT 'audit' (that family closed at W121).
  scada_connector: 'grid',
  // Wave 123 - MQTT / OPC-UA Edge-Device IIoT Connector. Sister of W122.
  // Joins the 'grid' chain because edge-device IoT telemetry from
  // inverters/BESS/wind turbines/RTUs reads as a grid-domain mutation -
  // explicitly NOT 'audit' (that family closed at W121).
  mqtt_opcua_connector: 'grid',
  // Wave 124 - STRATE / SWIFT Settlement Connector. PHASE C WAVE 3 of 5.
  // Money-in/money-out financial settlement spine: STRATE (SA CSD),
  // SWIFT MT/MX, SARB SAMOS RTGS, SADC RTGS, commercial bank EFT/ACH.
  // Opens the NEW 'settlement' audit namespace - explicitly NOT 'grid'
  // (W122/W123 family) because settlements are FINANCIAL not OT.
  strate_swift_connector: 'settlement',
  // Wave 125 - SAP / Oracle ERP Connector. PHASE C WAVE 4 of 5.
  // Enterprise back-office financial-integration spine: SAP S/4HANA,
  // SAP ECC, Oracle EBS/Fusion, Workday, Sage 300, Dynamics 365,
  // NetSuite, Epicor, IFS. Joins the SAME 'settlement' audit
  // namespace as W124 because both are FINANCIAL waves (W124 =
  // interbank rails; W125 = ERP GL/AP/AR) - explicitly NOT 'grid'.
  sap_oracle_erp_connector: 'settlement',
  // Wave 126 - CIPC / SARS / NERSA Government Filing APIs Connector.
  // PHASE C WAVE 5 of 5 - FINAL Phase-C connector wave. Closes Phase C.
  // SA government regulator filing spine: CIPC Annual Returns, SARS
  // e-Filing (IT14/VAT201/EMP201/IRP5), NERSA quarterly returns, DMRE
  // REIPPPP, DFFE GHG, PAIA. Opens the NEW 'regulator' audit namespace
  // - explicitly NOT 'settlement' (W124/W125 family) because government
  // statutory filings are REGULATORY-COMPLIANCE not FINANCIAL.
  government_filing_connector: 'regulator',
  // Wave 127 - Anomaly-Detection ML Model. FIRST wave of Phase D
  // (the ML-brain band, replacing the W71 heuristic prognostics
  // ensemble with real ML). Opens the NEW 'ml' audit namespace
  // (4th after platform/grid/settlement/regulator) so model
  // proposals, training, drift detections, rollbacks, recalls and
  // failovers all live under their own tamper-evident chain
  // partition - ISO 42001 AI Management Systems + NIST AI RMF +
  // EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013 alignment.
  // SIGNATURE: rollback_model crosses regulator EVERY tier
  // (W127-ML-ROLLBACK - first Phase-D hard line).
  anomaly_detection_ml: 'ml',
  // W128 RUL Prediction ML Model chain - JOINS W127 'ml' namespace
  // (SAME tamper-evident chain partition, not a new namespace).
  // Survival/Cox PH model proposals, training, drift detections,
  // rollbacks, recalls and OLS-failovers share the W127 partition
  // under ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2
  // Type II + NERC CIP-013. SIGNATURE: rollback_model crosses
  // regulator EVERY tier (W128-RUL-ROLLBACK - SECOND Phase-D hard
  // line). UNIQUE: promote_champion crosses at fleet_systemic when
  // iso_42001 (replacing OLS at systemic scale is itself a
  // governance event).
  rul_prediction_ml: 'ml',
  // W129 Fault-Fingerprint Multi-Class ML chain - JOINS W127+W128 'ml'
  // namespace (THIRD wave in the SAME tamper-evident chain partition).
  // XGBoost/RF/GB/CNN-1D/LightGBM/CatBoost/baseline_physics multi-class
  // classifier proposals, training, confusion-matrix validations,
  // class-drift detections, rollbacks, recalls, physics-baseline-
  // failovers and novel-class additions share the W127 partition
  // under ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 + SOC 2
  // Type II + NERC CIP-013. SIGNATURE: rollback_model crosses
  // regulator EVERY tier (W129-FFML-ROLLBACK - THIRD Phase-D hard
  // line). UNIQUE: add_novel_class crosses at fleet_systemic only
  // (adding a previously-unseen fault mode at fleet-wide scale is
  // EU-AI-Act-reportable model-scope expansion).
  fault_fingerprint_ml: 'ml',
  // W130 NTT Comparison Battery joins the 'ml' audit namespace alongside
  // W127/W128/W129. Each cycle aggregator row produces propose,
  // baselines_synced, telemetry_window_bound, ntt_emulation_run,
  // champion_predictions_collected, counterfactuals_computed,
  // revenue_weighted_scored, significance_tested, savings_certified,
  // audit_published (W118-mandatory), retraining_triggered, archived,
  // significance_failed (soft), rolled_back (hard), recalled (HARD -
  // W130 SIGNATURE crosses regulator EVERY tier), failover_to_prior_cycle.
  // SIGNATURE: recall_certification - withdrawal of a published savings
  // certification is ALWAYS reportable (SARB MA s38 + IFRS restatement +
  // ISO 42001 incident); CLOSES PHASE D ML governance ladder.
  ntt_comparison_battery: 'ml',
  // W131 Stage Gates — JOINS existing 'ipp' namespace alongside
  // ipp_schedule / ipp_evm / ipp_doc_control / ipp_submittal /
  // ipp_rfi / ipp_change_order. DO NOT open a new 'pm' namespace.
  // The W118 spine partition assumes one prefix per family.
  stage_gate: 'ipp',
  // W132 IPP Issues Log — JOINS existing 'ipp' namespace.
  // DO NOT open a new namespace; issue events audit alongside stage_gate/rfi/co.
  ipp_issue: 'ipp',
  // W133 IPP Risk Register — JOINS existing 'ipp' namespace.
  ipp_risk: 'ipp',
  // W134 IPP Stakeholder Register — JOINS existing 'ipp' namespace.
  ipp_stakeholder: 'ipp',
  // W135 IPP Lessons Learned Register — JOINS existing 'ipp' namespace.
  ipp_lessons_learned: 'ipp',
  // W136 IPP NCR Management — JOINS existing 'ipp' namespace.
  ipp_ncr: 'ipp',
  // W137 IPP Method Statement (SWMS) — JOINS existing 'ipp' namespace.
  ipp_method_statement: 'ipp',
  // W138 IPP Environmental Monitoring Log — JOINS existing 'ipp' namespace.
  // NEMA s30 + DFFE EIA conditions + ISO 14001. flag_exceedance EVERY tier on
  // near_sensitive_receptor/eia_condition_breach/nema_s30_notification.
  ipp_env_monitoring: 'ipp',
  // W139 IPP Material Inspection Record — JOINS existing 'ipp' namespace.
  // ISO 9001:2015 §8.6 + REIPPPP + EP4. reject_material EVERY tier when IE witnessed.
  ipp_mir: 'ipp',
  // W140 IPP Subcontractor Management — JOINS existing 'ipp' namespace.
  // OHSA Construction Regs 2014 Reg.6 + ISO 45001:2018 + REIPPPP ED + EP4.
  // terminate_subcontractor EVERY tier when safety_violation (OHSA mandatory).
  ipp_subcontractor: 'ipp',
  // W141 IPP Progress Claims & Payment Certificates — JOINS existing 'ipp' namespace.
  // JBCC + NEC4 + REIPPPP milestones + Equator EP4 disbursement certification.
  // certify_by_engineer EVERY tier on floor_ie_milestone_payment (lender notification mandatory).
  // record_final_account EVERY tier.
  // approve_payment when floor_lender_certification_required.
  ipp_progress_claim: 'ipp',
  // W142 IPP Technical Query (TQ) Log — JOINS existing 'ipp' namespace.
  // ISO 9001:2015 design communication + FIDIC EPC contracts + CIDB best practice.
  // URGENT SLA: safety_critical 24h (tightest) / construction_blocking 48h / standard 168h / information_only 336h.
  // SIGNATURE: flag_design_change EVERY tier when floor_structural_safety (structural integrity always reportable).
  // escalate_tq crosses when floor_ie_notification_required; issue_response crosses when floor_nersa_impact.
  ipp_tq: 'ipp',
  ipp_diary: 'ipp',
  ipp_si: 'ipp',
  ipp_dlp: 'ipp',
  ipp_vo: 'ipp',
  ipp_pc: 'ipp',
  ipp_fcc: 'ipp',
  ipp_omh: 'ipp',
  ipp_lr: 'ipp',
  ipp_ec: 'ipp',
  ipp_ct: 'ipp',
  ipp_ie: 'ipp',
  ipp_tpa: 'ipp',
  ipp_ppavar: 'ipp',
  ipp_coc: 'ipp',
  ipp_refi: 'ipp',
  ipp_fm: 'ipp',
  fm_evt: 'ipp',
  ipp_anr: 'ipp',
  anr_evt: 'ipp',
  ipp_cd: 'ipp',
  cd_evt: 'ipp',
  ipp_eco: 'ipp',
  eco_evt: 'ipp',
  ipp_lta: 'ipp',
  lta_evt: 'ipp',
  ipp_lam: 'ipp',
  lam_evt: 'ipp',
  ipp_ctr: 'ipp',
  ctr_evt: 'ipp',
  ipp_gcc: 'ipp',
  gcc_evt: 'ipp',
  ipp_ccc: 'ipp',
  ccc_evt: 'ipp',
  ipp_omc: 'ipp',
  omc_evt: 'ipp',
  ipp_bfs: 'ipp',
  bfs_evt: 'ipp',
  ipp_eam: 'ipp',
  eam_evt: 'ipp',
  ipp_wul: 'ipp',
  wul_evt: 'ipp',
  ipp_hra: 'ipp',
  hra_evt: 'ipp',
  ipp_ael: 'ipp',
  ael_evt: 'ipp',
  ipp_fmr: 'ipp',
  fmr_evt: 'ipp',
  ipp_lcr: 'ipp',
  lcr_evt: 'ipp',
  ipp_mc: 'ipp',
  mc_evt: 'ipp',
  ipp_esmr: 'ipp',
  esmr_evt: 'ipp',
  ipp_iear: 'ipp',
  iear_evt: 'ipp',
  ipp_insr: 'ipp',
  insr_evt: 'ipp',
  ipp_psec: 'ipp',
  psec_evt: 'ipp',
  ipp_cep: 'ipp',
  cep_evt: 'ipp',
  ipp_sed: 'ipp',
  sed_evt: 'ipp',
  ipp_bbbee: 'ipp',
  bbbee_evt: 'ipp',
  ipp_lrep: 'ipp',
  lrep_evt: 'ipp',
  ipp_acr: 'ipp',
  acr_evt: 'ipp',
  ipp_rpr: 'ipp',
  rpr_evt: 'ipp',
  ipp_eqt: 'ipp',
  eqt_evt: 'ipp',
  ipp_qgr: 'ipp',
  qgr_evt: 'ipp',
  ipp_acs: 'ipp',
  acs_evt: 'ipp',
  demand: 'trading',
  meter: 'grid',
  scenario: 'carbon',
  ai: 'platform',
};

function auditEntityTypeFor(event: string): string {
  const prefix = event.split('.')[0] ?? '';
  return AUDIT_PREFIX_MAP[prefix] || 'platform';
}

/**
 * Fire all cascade effects for a domain event:
 *   1. audit log   (durable record)
 *   2. notifications (fan-out to recipients)
 *   3. webhooks    (async external delivery; failures never block)
 *   4. special handlers (entity-specific follow-ons)
 *
 * Each stage is wrapped in `runStage`, which retries with exponential
 * backoff and, on terminal failure, persists to `cascade_dlq` so support
 * can inspect / retry from the /support/cascade-dlq console.
 *
 * The one exception is webhook delivery — it's fire-and-forget so a slow
 * external receiver never holds up the user's request. Webhook failures
 * still reach DLQ but via runStage running inside the .catch chain.
 */
export async function fireCascade(ctx: CascadeContext): Promise<void> {
  // Fast path: collect every durable write (audit + N notification rows)
  // into a single env.DB.batch() call. That's 1 D1 round-trip total for
  // the stage that used to cost 1 + N. Falls back to per-stage execution
  // if batch() fails (older D1 client, schema drift, etc.), preserving
  // the existing retry + DLQ semantics.
  const batched = await tryBatchAuditAndNotifications(ctx);
  if (!batched) {
    await runStage(ctx, 'audit', () => createAuditLog(ctx, ctx.env));
    await runStage(ctx, 'notifications', () => createNotifications(ctx, ctx.env));
  }

  // L5 — tamper-evident audit chain hook. Awaited but error-isolated:
  // append failures must never break the cascade or the user request, but
  // we DO await the append so callers (and tests) observe the chain
  // advance before fireCascade resolves. Opts out for
  // `audit.event_appended` events which are emitted by appendAudit itself
  // and would otherwise recurse.
  if (!ctx.skipAudit && ctx.event !== 'audit.event_appended') {
    try {
      await autoAppendAudit(ctx);
    } catch (e) {
      console.warn('auto_audit_failed', ctx.event, (e as Error).message);
    }
  }

  // Webhooks run async so user-facing responses aren't blocked on slow
  // external endpoints. Terminal failure still lands in DLQ.
  void runStage(ctx, 'webhooks', () => deliverWebhooks(ctx)).catch(() => {
    /* runStage already persisted to DLQ; nothing else to do. */
  });

  await runStage(ctx, 'special', () => handleSpecialCascades(ctx));
}

// Lazy-imported to avoid circular cascade.ts ↔ audit-chain.ts dependency.
async function autoAppendAudit(ctx: CascadeContext): Promise<void> {
  // Dynamic import keeps the module graph acyclic at type-check time.
  const { appendAudit } = await import('./audit-chain');
  await appendAudit({
    env: ctx.env,
    entity_type: auditEntityTypeFor(ctx.event),
    entity_id: ctx.entity_id,
    event_type: ctx.event,
    actor_id: ctx.actor_id || 'system',
    payload: ctx.data || {},
  });
}

async function tryBatchAuditAndNotifications(ctx: CascadeContext): Promise<boolean> {
  const db = ctx.env?.DB;
  if (!db || typeof db.batch !== 'function') return false;
  let recipients: string[];
  try {
    recipients = await determineNotificationRecipients(ctx, ctx.env);
  } catch {
    return false;
  }
  const auditStmt = db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    generateId(),
    ctx.actor_id || null,
    ctx.event,
    ctx.entity_type,
    ctx.entity_id,
    JSON.stringify(ctx.data || {}),
    new Date().toISOString(),
  );
  const stmts: unknown[] = [auditStmt];
  if (recipients.length > 0) {
    const { title, body } = buildNotificationContent(ctx);
    const type = ctx.event.split('.')[0];
    const now = new Date().toISOString();
    const dataJson = JSON.stringify(ctx.data || {});
    for (const rid of recipients) {
      stmts.push(
        db.prepare(
          `INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(generateId(), rid, type, title, body, dataJson, now),
      );
    }
  }
  try {
    await db.batch(stmts);
    return true;
  } catch (err) {
    // Batch failed — let the per-stage retry path handle it. Log so we
    // notice if batch() is consistently failing.
    console.warn('cascade_batch_failed', (err as Error).message);
    return false;
  }
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

async function runStage<T>(
  ctx: CascadeContext,
  stage: 'audit' | 'notifications' | 'webhooks' | 'special',
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T | undefined> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 50;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  await writeToDlq(ctx, stage, lastErr, maxAttempts);
  return undefined;
}

async function writeToDlq(
  ctx: CascadeContext,
  stage: 'audit' | 'notifications' | 'webhooks' | 'special',
  err: unknown,
  attemptCount: number,
): Promise<void> {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack || null : null;

  try {
    await ctx.env.DB.prepare(
      `INSERT INTO cascade_dlq
         (id, event, entity_type, entity_id, actor_id, payload, stage,
          error_message, error_stack, attempt_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
      .bind(
        generateId(),
        ctx.event,
        ctx.entity_type,
        ctx.entity_id,
        ctx.actor_id || null,
        JSON.stringify(ctx.data || {}),
        stage,
        errorMessage,
        errorStack,
        attemptCount,
      )
      .run();
  } catch (dlqErr) {
    // Last resort — DLQ itself is down. Log, but never throw to the caller.
    console.error(`DLQ write failed for ${ctx.event}/${stage}:`, dlqErr);
    console.error('Original cascade error:', err);
  }
}

/**
 * Replay a DLQ row. Used by the support console. Re-runs the given stage
 * only; on success flips the row to status='resolved'. On failure bumps
 * attempt_count + last_attempt_at so staff can see the latest diagnostic.
 */
export async function retryDlqItem(
  env: { DB: any },
  dlqId: string,
  operatorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = await env.DB.prepare(
    `SELECT id, event, entity_type, entity_id, actor_id, payload, stage, attempt_count, status
       FROM cascade_dlq WHERE id = ?`,
  )
    .bind(dlqId)
    .first() as {
      id: string;
      event: string;
      entity_type: string;
      entity_id: string;
      actor_id: string | null;
      payload: string;
      stage: 'audit' | 'notifications' | 'webhooks' | 'special';
      attempt_count: number;
      status: string;
    } | null;

  if (!row) return { ok: false, error: 'DLQ row not found' };
  if (row.status !== 'pending') return { ok: false, error: `Row is ${row.status}` };

  const ctx: CascadeContext = {
    event: row.event as EventType,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    actor_id: row.actor_id || undefined,
    data: (() => {
      try { return JSON.parse(row.payload); } catch { return {}; }
    })(),
    env,
  };

  try {
    switch (row.stage) {
      case 'audit':
        await createAuditLog(ctx, env);
        break;
      case 'notifications':
        await createNotifications(ctx, env);
        break;
      case 'webhooks':
        await deliverWebhooks(ctx);
        break;
      case 'special':
        await handleSpecialCascades(ctx);
        break;
    }

    await env.DB.prepare(
      `UPDATE cascade_dlq
          SET status = 'resolved', resolved_at = datetime('now'),
              resolved_by = ?, last_attempt_at = datetime('now'),
              attempt_count = attempt_count + 1
        WHERE id = ?`,
    )
      .bind(operatorId, dlqId)
      .run();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `UPDATE cascade_dlq
          SET last_attempt_at = datetime('now'),
              attempt_count = attempt_count + 1,
              error_message = ?
        WHERE id = ?`,
    )
      .bind(msg, dlqId)
      .run();
    return { ok: false, error: msg };
  }
}

/** Resolve without retry — support marks a DLQ row as handled out-of-band. */
export async function resolveDlqItem(
  env: { DB: any },
  dlqId: string,
  operatorId: string,
  status: 'resolved' | 'abandoned',
  note?: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE cascade_dlq
        SET status = ?, resolved_at = datetime('now'), resolved_by = ?,
            resolution_note = ?
      WHERE id = ? AND status = 'pending'`,
  )
    .bind(status, operatorId, note || null, dlqId)
    .run();
}

async function createAuditLog(ctx: CascadeContext, env: any): Promise<void> {
  // Intentionally NO inner try/catch here — runStage() wraps this call in its
  // own retry + DLQ fallback loop (see runStage above), and swallowing errors
  // locally turns that retry/DLQ machinery into dead code. Any DB failure
  // must propagate so the audit-log stage can be retried and, if all retries
  // fail, dead-lettered for support to inspect and replay.
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateId(),
    ctx.actor_id || null,
    ctx.event,
    ctx.entity_type,
    ctx.entity_id,
    JSON.stringify(ctx.data || {}),
    new Date().toISOString()
  ).run();
}

async function createNotifications(ctx: CascadeContext, env: any): Promise<void> {
  const recipients = await determineNotificationRecipients(ctx, env);
  if (recipients.length === 0) return;

  // COST: batch every notification INSERT into a single D1 round-trip via
  // env.DB.batch(). Previously this was N round-trips (one per recipient),
  // which on a large-fanout event (e.g. curtailment notice broadcast to
  // every grid operator + IPP developer) could mean 50+ D1 queries for a
  // single domain event.
  const { title, body } = buildNotificationContent(ctx);
  const dataJson = JSON.stringify(ctx.data || {});
  const type = ctx.event.split('.')[0];
  const now = new Date().toISOString();

  const statements = recipients.map((recipient_id) =>
    env.DB.prepare(
      `INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      generateId(),
      recipient_id,
      type,
      title,
      body,
      dataJson,
      now,
    ),
  );
  try {
    // D1 batch() runs all statements in a single server round-trip and
    // wraps them in an implicit transaction — atomicity is a bonus.
    await env.DB.batch(statements);
  } catch (err) {
    // If batch() isn't available (older D1 client, test stub) or fails
    // mid-transaction, fall back to per-statement writes so the cascade
    // still delivers as much as possible.
    console.warn('notification_batch_failed', (err as Error).message);
    for (const stmt of statements) {
      try { await stmt.run(); } catch (e) { console.error('Notification creation failed:', e); }
    }
  }
}

async function determineNotificationRecipients(ctx: CascadeContext, env: any): Promise<string[]> {
  const recipients = new Set<string>();
  
  // Always notify the actor
  if (ctx.actor_id) recipients.add(ctx.actor_id);
  
  // Add recipients based on entity type and event
  switch (ctx.entity_type) {
    case 'contract_documents': {
      const doc = await env.DB.prepare('SELECT creator_id, counterparty_id FROM contract_documents WHERE id = ?').bind(ctx.entity_id).first();
      if (doc) {
        recipients.add(doc.creator_id);
        recipients.add(doc.counterparty_id);
      }
      // Notify admin for statutory checks
      if (ctx.event.includes('statutory')) {
        const admins = await env.DB.prepare("SELECT id FROM participants WHERE role = 'admin'").all();
        admins.results?.forEach((a: any) => recipients.add(a.id));
      }
      break;
    }
    case 'trade_matches':
    case 'escrow_accounts': {
      // Prefer the buyer/seller participant IDs that the firer passed through
      // in `ctx.data` (trading.ts / invoices.ts handlers already have them),
      // and fall back to a JOIN through trade_orders if the caller didn't
      // include them. `trade_matches` itself only stores buy_order_id /
      // sell_order_id — participants are resolved via trade_orders.
      const dataBuyer = ctx.data?.buyer_id as string | undefined;
      const dataSeller = ctx.data?.seller_id as string | undefined;
      if (dataBuyer) recipients.add(dataBuyer);
      if (dataSeller) recipients.add(dataSeller);
      if (!dataBuyer || !dataSeller) {
        try {
          const match = await env.DB.prepare(`
            SELECT b.participant_id AS buyer_id, s.participant_id AS seller_id
            FROM trade_matches tm
            JOIN trade_orders b ON tm.buy_order_id = b.id
            JOIN trade_orders s ON tm.sell_order_id = s.id
            WHERE tm.id = ?
          `).bind(ctx.entity_id).first();
          if (match?.buyer_id) recipients.add(match.buyer_id as string);
          if (match?.seller_id) recipients.add(match.seller_id as string);
        } catch {
          // Swallow resolver errors so a schema mismatch never aborts the
          // whole cascade chain (audit + webhooks + handlers still run).
        }
      }
      break;
    }
    case 'invoices': {
      const inv = await env.DB.prepare('SELECT from_participant_id, to_participant_id FROM invoices WHERE id = ?').bind(ctx.entity_id).first();
      if (inv) {
        recipients.add(inv.from_participant_id);
        recipients.add(inv.to_participant_id);
      }
      break;
    }
    case 'ipp_projects': {
      const dev = await cachedProjectDeveloper(env, ctx.entity_id);
      if (dev) recipients.add(dev);
      // Notify lenders too
      const lenders = await env.DB.prepare('SELECT DISTINCT investor_participant_id FROM fund_commitments fc JOIN energy_funds ef ON fc.fund_id = ef.id').all();
      lenders.results?.forEach((l: any) => recipients.add(l.investor_participant_id));
      break;
    }
    case 'project_disbursements': {
      const disp = await env.DB.prepare(`
        SELECT p.developer_id, pd.requested_by 
        FROM project_disbursements pd 
        JOIN ipp_projects p ON pd.project_id = p.id 
        WHERE pd.id = ?
      `).bind(ctx.entity_id).first();
      if (disp) {
        recipients.add(disp.developer_id);
        recipients.add(disp.requested_by);
      }
      break;
    }
    case 'esg_reports': {
      const report = await env.DB.prepare('SELECT participant_id FROM esg_reports WHERE id = ?').bind(ctx.entity_id).first();
      if (report) recipients.add(report.participant_id);
      const admins = await env.DB.prepare("SELECT id FROM participants WHERE role = 'admin'").all();
      admins.results?.forEach((a: any) => recipients.add(a.id));
      break;
    }
    case 'ona_faults': {
      const fault = await env.DB.prepare('SELECT sf.project_id FROM ona_faults sf WHERE sf.id = ?').bind(ctx.entity_id).first();
      if (fault) {
        const dev = await cachedProjectDeveloper(env, fault.project_id);
        if (dev) recipients.add(dev);
        // Notify lenders of DSCR impact
        const lenders = await env.DB.prepare('SELECT investor_participant_id FROM fund_commitments').all();
        lenders.results?.forEach((l: any) => recipients.add(l.investor_participant_id));
        // Notify offtakers
        const contracts = await env.DB.prepare('SELECT counterparty_id FROM contract_documents WHERE project_id = ?').bind(fault.project_id).all();
        contracts.results?.forEach((c: any) => recipients.add(c.counterparty_id));
      }
      break;
    }
    // ─── National-scale recipient resolution ─────────────────────────────
    case 'regulator_licences': {
      try {
        const row = await env.DB
          .prepare('SELECT licensee_participant_id FROM regulator_licences WHERE id = ?')
          .bind(ctx.entity_id).first();
        if (row?.licensee_participant_id) recipients.add(row.licensee_participant_id as string);
      } catch { /* schema missing on older deploys */ }
      await addRolesTo(env, recipients, ['regulator']);
      break;
    }
    case 'regulator_tariff_submissions':
    case 'regulator_tariff_decisions': {
      try {
        const row = await env.DB
          .prepare(`SELECT licensee_participant_id FROM regulator_tariff_submissions WHERE id = ?
                    UNION ALL
                    SELECT s.licensee_participant_id FROM regulator_tariff_decisions d
                      JOIN regulator_tariff_submissions s ON s.id = d.submission_id
                     WHERE d.id = ?`)
          .bind(ctx.entity_id, ctx.entity_id).first();
        if (row?.licensee_participant_id) recipients.add(row.licensee_participant_id as string);
      } catch { /* */ }
      await addRolesTo(env, recipients, ['regulator']);
      break;
    }
    case 'regulator_enforcement_cases':
    case 'regulator_surveillance_alerts': {
      if (ctx.data?.respondent_participant_id) recipients.add(ctx.data.respondent_participant_id as string);
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      await addRolesTo(env, recipients, ['regulator']);
      break;
    }
    case 'dispatch_instructions': {
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      await addRolesTo(env, recipients, ['grid_operator']);
      break;
    }
    case 'curtailment_notices':
    case 'grid_outages': {
      // National / zonal — notify all grid operators + IPPs.
      await addRolesTo(env, recipients, ['grid_operator', 'ipp_developer']);
      break;
    }
    case 'ancillary_service_tenders': {
      // Open tenders are broadcast to active generators.
      await addRolesTo(env, recipients, ['ipp_developer', 'grid_operator', 'trader']);
      break;
    }
    case 'margin_calls': {
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      await addRolesTo(env, recipients, ['admin']);
      break;
    }
    case 'credit_limits': {
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      break;
    }
    case 'covenants':
    case 'covenant_tests':
    case 'covenant_waivers': {
      // Lender + IPP developer of the linked project.
      if (ctx.data?.lender_participant_id) recipients.add(ctx.data.lender_participant_id as string);
      if (ctx.data?.project_id) {
        const dev = await cachedProjectDeveloper(env, ctx.data.project_id as string);
        if (dev) recipients.add(dev);
      }
      break;
    }
    case 'ie_certifications': {
      if (ctx.data?.ie_participant_id) recipients.add(ctx.data.ie_participant_id as string);
      if (ctx.data?.project_id) {
        const dev = await cachedProjectDeveloper(env, ctx.data.project_id as string);
        if (dev) recipients.add(dev);
      }
      await addRolesTo(env, recipients, ['lender']);
      break;
    }
    case 'epc_contracts':
    case 'epc_variations':
    case 'epc_liquidated_damages':
    case 'environmental_authorisations':
    case 'environmental_compliance':
    case 'insurance_policies':
    case 'insurance_claims':
    case 'community_engagements':
    case 'ed_sed_spend': {
      if (ctx.data?.project_id) {
        const dev = await cachedProjectDeveloper(env, ctx.data.project_id as string);
        if (dev) recipients.add(dev);
      }
      break;
    }
    case 'rec_retirements':
    case 'scope2_disclosures': {
      if (ctx.data?.retiring_participant_id) recipients.add(ctx.data.retiring_participant_id as string);
      if (ctx.data?.participant_id) recipients.add(ctx.data.participant_id as string);
      break;
    }
    case 'mrv_submissions':
    case 'mrv_verifications':
    case 'carbon_tax_offset_claims': {
      if (ctx.data?.submitted_by) recipients.add(ctx.data.submitted_by as string);
      if (ctx.data?.taxpayer_participant_id) recipients.add(ctx.data.taxpayer_participant_id as string);
      await addRolesTo(env, recipients, ['carbon_fund']);
      break;
    }
    case 'tenants':
    case 'tenant_subscriptions':
    case 'tenant_invoices':
    case 'feature_flags': {
      await addRolesTo(env, recipients, ['admin']);
      break;
    }
    default:
      break;
  }

  return Array.from(recipients);
}

/**
 * Cached lookup of a project's developer_id. ipp_projects.developer_id is
 * essentially immutable (ownership transfer is a legal event, not a
 * runtime one) so a 1-hour TTL is safe. The cascade resolver calls this
 * for every project-scoped event — EPC variations, insurance claims,
 * environmental compliance, community engagement, ED/SED spend.
 *
 * Cache key: `cascade:project_developer:<project_id>`.
 * Sentinel `__missing__` prevents repeat D1 hits for deleted projects.
 */
const PROJECT_DEV_CACHE_PREFIX = 'cascade:project_developer:';
const PROJECT_DEV_TTL_SECONDS = 3600;
const PROJECT_DEV_MISSING = '__missing__';

async function cachedProjectDeveloper(
  env: { DB: any; KV: any },
  projectId: string,
): Promise<string | null> {
  const key = PROJECT_DEV_CACHE_PREFIX + projectId;
  try {
    const cached = await env.KV.get(key);
    if (cached === PROJECT_DEV_MISSING) return null;
    if (cached) return cached;
  } catch { /* KV miss → DB */ }
  try {
    const row = await env.DB
      .prepare('SELECT developer_id FROM ipp_projects WHERE id = ?')
      .bind(projectId)
      .first() as { developer_id?: string } | null;
    const dev = row?.developer_id || null;
    try {
      await env.KV.put(key, dev ?? PROJECT_DEV_MISSING, { expirationTtl: PROJECT_DEV_TTL_SECONDS });
    } catch { /* soft */ }
    return dev;
  } catch {
    return null;
  }
}

/** Drop the cached developer_id for a project. Call from the one place that
 *  can change it (admin re-assignment). */
export async function invalidateProjectDeveloperCache(
  env: { KV: { delete: (k: string) => Promise<unknown> } },
  projectId: string,
): Promise<void> {
  try { await env.KV.delete(PROJECT_DEV_CACHE_PREFIX + projectId); } catch { /* soft */ }
}

/**
 * Add every active participant holding any of the listed roles to the
 * recipients set.
 *
 * COST: fireCascade() invokes this once per cascade for the "broadcast to
 * role" recipient groups. On a busy day that's hundreds of calls, each
 * issuing an identical `SELECT id FROM participants WHERE role IN (...)`
 * query that changes only when someone creates / suspends an account.
 *
 * We cache the result per role-group in KV for 60 s. Cache key is the
 * sorted role list joined with `|`. Admin mutations that change a
 * participant's role/status invalidate via `invalidateRoleRosterCache()`.
 */
const ROLE_ROSTER_CACHE_PREFIX = 'cascade:role_roster:';
const ROLE_ROSTER_TTL_SECONDS = 60;

async function addRolesTo(env: any, recipients: Set<string>, roles: string[]): Promise<void> {
  if (roles.length === 0) return;
  const sortedKey = ROLE_ROSTER_CACHE_PREFIX + [...roles].sort().join('|');

  try {
    const cached = await env.KV.get(sortedKey, 'json') as string[] | null;
    if (cached) {
      for (const id of cached) recipients.add(id);
      return;
    }
  } catch { /* KV miss → fall through to D1. */ }

  const placeholders = roles.map(() => '?').join(',');
  try {
    const rows = await env.DB.prepare(
      `SELECT id FROM participants WHERE role IN (${placeholders}) AND status = 'active' LIMIT 50`,
    ).bind(...roles).all();
    const ids = ((rows.results || []) as Array<{ id: string }>).map((r) => r.id);
    for (const id of ids) recipients.add(id);
    try {
      await env.KV.put(sortedKey, JSON.stringify(ids), { expirationTtl: ROLE_ROSTER_TTL_SECONDS });
    } catch { /* soft */ }
  } catch {
    /* swallow — cascade still runs for explicit recipients */
  }
}

/**
 * Drop every role-roster cache entry. The admin UI calls this when a
 * participant's role or status changes. Over-broad by design: there's no
 * cheap way to know which role-lists the participant appears in, so we
 * clear them all. The cache rebuilds naturally within the TTL.
 */
export async function invalidateRoleRosterCache(env: { KV: { list: (opts: { prefix: string }) => Promise<{ keys: Array<{ name: string }> }>; delete: (k: string) => Promise<unknown> } }): Promise<void> {
  try {
    const list = await env.KV.list({ prefix: ROLE_ROSTER_CACHE_PREFIX });
    await Promise.all(list.keys.map((k) => env.KV.delete(k.name).catch(() => null)));
  } catch { /* soft */ }
}

function buildNotificationContent(ctx: CascadeContext): { title: string; body: string } {
  const eventHandlers: Record<string, () => { title: string; body: string }> = {
    'auth.registered': () => ({ title: 'Welcome to Open Energy', body: 'Your account has been created. Please verify your email.' }),
    'auth.login': () => ({ title: 'New Login Detected', body: 'A new login was recorded for your account.' }),
    'contract.phase_changed': () => ({ 
      title: `Contract Phase: ${ctx.data?.new_phase || 'updated'}`, 
      body: `Contract ${ctx.entity_id} has moved to ${ctx.data?.new_phase || 'a new phase'}.` 
    }),
    'contract.signed': () => ({ 
      title: 'Contract Signed', 
      body: `Document ${ctx.entity_id} has been signed by all parties.` 
    }),
    'trade.matched': () => ({ 
      title: 'Trade Executed', 
      body: `A ${ctx.data?.volume_mwh || 0} MWh trade has been matched at R${ctx.data?.price_per_mwh || 0}/MWh.` 
    }),
    'escrow.created': () => ({ 
      title: 'Escrow Account Created', 
      body: `Escrow of R${ctx.data?.amount || 0} created for trade ${ctx.data?.match_id || ctx.entity_id}.` 
    }),
    'invoice.issued': () => ({ 
      title: 'Invoice Issued', 
      body: `Invoice ${ctx.data?.invoice_number || ctx.entity_id} for R${ctx.data?.total_amount || 0} has been issued.` 
    }),
    'invoice.paid': () => ({ 
      title: 'Payment Received', 
      body: `Payment of R${ctx.data?.paid_amount || 0} received for invoice ${ctx.data?.invoice_number || ctx.entity_id}.` 
    }),
    'invoice.overdue': () => ({ 
      title: 'Invoice Overdue', 
      body: `Invoice ${ctx.data?.invoice_number || ctx.entity_id} is overdue. Please take action.` 
    }),
    'dispute.filed': () => ({ 
      title: 'Dispute Filed', 
      body: `A dispute has been filed for invoice ${ctx.data?.invoice_id || ctx.entity_id}.` 
    }),
    'carbon.traded': () => ({ 
      title: 'Carbon Trade Executed', 
      body: `${ctx.data?.volume_tco2 || 0} tCO₂e ${ctx.data?.credit_type || 'credits'} traded at R${ctx.data?.price_per_tco2 || 0}/tCO₂e.` 
    }),
    'carbon.retired': () => ({ 
      title: 'Carbon Credits Retired', 
      body: `${ctx.data?.quantity || 0} tCO₂e have been retired for ${ctx.data?.beneficiary_name || 'specified beneficiary'}.` 
    }),
    'ipp.project_created': () => ({ 
      title: 'IPP Project Created', 
      body: `New project "${ctx.data?.project_name || ctx.entity_id}" has been created.` 
    }),
    'ipp.project_updated': () => ({ 
      title: 'IPP Project Updated', 
      body: `Project ${ctx.data?.project_name || ctx.entity_id} metadata has been updated${ctx.data?.fields ? ` (${(ctx.data.fields as string[]).join(', ')})` : ''}.` 
    }),
    'ipp.milestone_satisfied': () => ({ 
      title: 'Milestone Achieved', 
      body: `Milestone "${ctx.data?.milestone_name || 'Unknown'}" for project ${ctx.data?.project_id || ctx.entity_id} has been satisfied.` 
    }),
    'ipp.financial_close': () => ({ 
      title: 'Financial Close Declared', 
      body: `Project ${ctx.data?.project_id || ctx.entity_id} has achieved Financial Close. Construction begins!` 
    }),
    'ipp.disbursement_requested': () => ({ 
      title: 'Disbursement Requested', 
      body: `Disbursement request of R${ctx.data?.requested_amount || 0} for project ${ctx.data?.project_id || ctx.entity_id}.` 
    }),
    'ipp.disbursement_approved': () => ({ 
      title: 'Disbursement Approved', 
      body: `R${ctx.data?.approved_amount || 0} disbursement approved for project ${ctx.data?.project_id || ctx.entity_id}.` 
    }),
    'esg.report_published': () => ({ 
      title: 'ESG Report Published', 
      body: `ESG Report "${ctx.data?.report_title || ctx.entity_id}" has been published.` 
    }),
    'esg.score_calculated': () => ({ 
      title: 'ESG Score Updated', 
      body: `ESG score recalculated for your entity. New score: ${ctx.data?.new_score || 'N/A'}.` 
    }),
    'grid.constraint_active': () => ({ 
      title: 'Grid Constraint Active', 
      body: `${ctx.data?.severity || 'Medium'} constraint at ${ctx.data?.location || 'unknown location'}. Capacity reduced to ${ctx.data?.available_capacity_mw || 0} MW.` 
    }),
    'ona.fault_detected': () => ({ 
      title: 'Fault Detected — Action Required', 
      body: `${ctx.data?.severity || 'Medium'} fault at site ${ctx.data?.site_name || ctx.entity_id}. Estimated impact: R${ctx.data?.estimated_revenue_impact || 0}/day.` 
    }),
    'marketplace.bid': () => ({ 
      title: 'New Bid Received', 
      body: `A bid of R${ctx.data?.bid_amount || 0} has been submitted for your listing.` 
    }),
    'intelligence.item_created': () => ({ 
      title: `Intelligence: ${ctx.data?.severity || 'Info'}`, 
      body: ctx.data?.title as string || 'New intelligence item created.' 
    }),
    'action_queue.created': () => ({
      title: 'Action Required',
      body: ctx.data?.title as string || 'A new action has been assigned to you.'
    }),

    // ─── National-scale notifications ──────────────────────────────────
    'regulator.licence_suspended': () => ({
      title: 'Licence suspended',
      body: `Licence ${ctx.data?.licence_number || ctx.entity_id} has been suspended by the regulator.`,
    }),
    'regulator.licence_revoked': () => ({
      title: 'Licence revoked',
      body: `Licence ${ctx.data?.licence_number || ctx.entity_id} has been revoked. Operations under this licence must cease immediately.`,
    }),
    'regulator.tariff_determined': () => ({
      title: 'Tariff determination issued',
      body: `Determination ${ctx.data?.decision_number || ''} effective ${ctx.data?.effective_from || 'soon'}.`,
    }),
    'regulator.enforcement_finding': () => ({
      title: 'Enforcement finding issued',
      body: `Case ${ctx.entity_id}: penalty R${ctx.data?.penalty_amount_zar || 0}. See the case file for details.`,
    }),
    'regulator.surveillance_alert_raised': () => ({
      title: `Surveillance alert: ${ctx.data?.rule_code || 'market abuse'}`,
      body: `Severity ${ctx.data?.severity || 'medium'}. Review in the Regulator workbench.`,
    }),
    'regulator.surveillance_escalated': () => ({
      title: 'Alert escalated to enforcement',
      body: `Surveillance alert escalated to formal enforcement case ${ctx.data?.case_id || ''}.`,
    }),

    'grid.instruction_issued': () => ({
      title: `Dispatch instruction: ${ctx.data?.instruction_type || 'action required'}`,
      body: `Target ${ctx.data?.target_mw || 0} MW effective ${ctx.data?.effective_from || 'now'}. Acknowledge in the Grid workbench.`,
    }),
    'grid.instruction_non_compliant': () => ({
      title: 'Dispatch non-compliance flagged',
      body: `Instruction ${ctx.entity_id} assessed non-compliant. Penalty: R${ctx.data?.penalty_amount_zar || 0}.`,
    }),
    'grid.curtailment_issued': () => ({
      title: `Curtailment notice — ${ctx.data?.severity || 'advisory'}`,
      body: `Zone ${ctx.data?.affected_zone || 'national'}: ${ctx.data?.curtailment_mw || 0} MW curtailment in effect.`,
    }),
    'grid.outage_reported': () => ({
      title: 'Grid outage reported',
      body: `Outage ${ctx.data?.outage_number || ctx.entity_id}: ${ctx.data?.affected_load_mw || 0} MW / ${ctx.data?.affected_customers || 0} customers affected.`,
    }),

    'trader.margin_call_issued': () => ({
      title: 'Margin call issued',
      body: `Shortfall R${ctx.data?.shortfall_zar || 0}. Due by ${ctx.data?.due_by || 'end of next business day'}.`,
    }),
    'trader.credit_limit_set': () => ({
      title: 'Trading credit limit updated',
      body: `New limit R${ctx.data?.limit_zar || 0} effective ${ctx.data?.effective_from || 'immediately'}.`,
    }),
    'trader.clearing_run_complete': () => ({
      title: 'Clearing run settled',
      body: `Trading day ${ctx.data?.trading_day || ''}: net R${ctx.data?.total_net_zar || 0} across ${ctx.data?.obligations_count || 0} participants.`,
    }),

    'lender.covenant_breach': () => ({
      title: `Covenant breach: ${ctx.data?.covenant_code || ''}`,
      body: `Measured ${ctx.data?.measured_value ?? 'n/a'} vs threshold ${ctx.data?.threshold ?? 'n/a'}. Material-adverse-effect: ${ctx.data?.material_adverse_effect ? 'YES' : 'no'}.`,
    }),
    'lender.covenant_warn': () => ({
      title: `Covenant warning: ${ctx.data?.covenant_code || ''}`,
      body: `Approaching threshold. Measured ${ctx.data?.measured_value ?? 'n/a'} vs ${ctx.data?.threshold ?? 'n/a'}.`,
    }),
    'lender.covenant_waived': () => ({
      title: 'Covenant waiver granted',
      body: `Waiver for ${ctx.data?.covenant_code || ''} until ${ctx.data?.requested_until || 'further notice'}.`,
    }),
    'lender.ie_certified': () => ({
      title: 'IE certification approved',
      body: `Certificate ${ctx.data?.cert_number || ''}: drawdown of R${ctx.data?.certified_amount_zar || 0} cleared.`,
    }),

    'ipp.ea_condition_breach': () => ({
      title: 'Environmental Authorisation condition breached',
      body: `Condition ${ctx.data?.condition_reference || ''} flagged non-compliant. Compliance and reporting action required.`,
    }),
    'ipp.insurance_expiring': () => ({
      title: 'Insurance policy expiring soon',
      body: `Policy ${ctx.data?.policy_number || ''} expires ${ctx.data?.period_end || 'soon'} — renew to stay covenant-compliant.`,
    }),
    'ipp.ld_assessed': () => ({
      title: 'Liquidated damages assessed',
      body: `R${ctx.data?.capped_amount_zar || ctx.data?.calculated_amount_zar || 0} assessed under EPC ${ctx.data?.epc_contract_id || ''}.`,
    }),

    'offtaker.rec_retired': () => ({
      title: 'RECs retired',
      body: `${ctx.data?.consumption_mwh || 0} MWh retired against ${ctx.data?.retirement_purpose || 'Scope 2'} claim.`,
    }),
    'offtaker.budget_exceeded': () => ({
      title: 'Energy budget exceeded',
      body: `Period ${ctx.data?.period || ''} consumption exceeded budget by ${ctx.data?.variance_pct || 0}%.`,
    }),

    'carbon.mrv_verified': () => ({
      title: 'MRV verification issued',
      body: `Opinion: ${ctx.data?.opinion || 'unknown'}. Verified reductions: ${ctx.data?.verified_reductions_tco2e || 0} tCO₂e.`,
    }),
    'carbon.tax_claim_submitted': () => ({
      title: 'Carbon Tax offset claim submitted',
      body: `Tax year ${ctx.data?.tax_year || ''}: R${ctx.data?.offset_applied_zar || 0} offset applied, net R${ctx.data?.net_tax_liability_zar || 0}.`,
    }),

    'tenant.provisioned': () => ({
      title: 'Tenant provisioned',
      body: `Tenant ${ctx.data?.tenant_id || ctx.entity_id} is active on the ${ctx.data?.tier || 'standard'} plan.`,
    }),
    'tenant.invoice_issued': () => ({
      title: 'Platform invoice issued',
      body: `Invoice ${ctx.data?.invoice_number || ''} — R${ctx.data?.total_zar || 0} due ${ctx.data?.due_at || 'in 30 days'}.`,
    }),
  };

  const handler = eventHandlers[ctx.event];
  return handler ? handler() : { title: ctx.event, body: `Event ${ctx.event} on ${ctx.entity_type}:${ctx.entity_id}` };
}

async function deliverWebhooks(ctx: CascadeContext): Promise<void> {
  // Get all webhook endpoints for this event type
  const webhooks = await ctx.env.KV.get('webhooks', 'json') as Record<string, string[]> || {};
  const endpoints = webhooks[ctx.event] || [];
  
  for (const url of endpoints) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OE-Event': ctx.event },
        body: JSON.stringify({
          event: ctx.event,
          entity_type: ctx.entity_type,
          entity_id: ctx.entity_id,
          data: ctx.data,
          timestamp: new Date().toISOString()
        })
      });
    } catch (err) {
      console.error(`Webhook delivery failed to ${url}:`, err);
    }
  }
}

async function handleSpecialCascades(ctx: CascadeContext): Promise<void> {
  const db = ctx.env.DB;
  switch (ctx.event) {
    case 'trade.matched': {
      // Auto-create escrow + initial invoice + action queues for both sides
      if (ctx.data?.match_id) {
        await db.prepare(`
          INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at)
          VALUES (?, ?, ?, 'ZAR', 'held', ?)
        `).bind(generateId(), ctx.data.match_id, ctx.data.total_value || 0, new Date().toISOString()).run();
      }
      if (ctx.data?.match_id && ctx.data?.buyer_id && ctx.data?.seller_id) {
        const invoiceId = generateId();
        const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
        const total = Number(ctx.data.total_value || 0);
        const subtotal = total / 1.15;
        const vat = total - subtotal;
        const deliveryDate = (ctx.data.delivery_date as string) || new Date().toISOString().split('T')[0];
        await db.prepare(`
          INSERT INTO invoices (id, invoice_number, match_id, from_participant_id, to_participant_id,
            invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount,
            total_amount, due_date, status, tenant_id, issued_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'energy', ?, ?, ?, ?, 0.15, ?, ?, ?, 'issued', 'default', ?, ?, ?)
        `).bind(
          invoiceId, invoiceNum, ctx.data.match_id, ctx.data.seller_id, ctx.data.buyer_id,
          deliveryDate, deliveryDate,
          JSON.stringify([{ description: 'Energy supply', volume_mwh: ctx.data.volume_mwh, price_per_mwh: ctx.data.price_per_mwh }]),
          subtotal, vat, total,
          new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
        ).run();

        await enqueueAction(db, {
          type: 'invoice_payment',
          priority: 'high',
          actor_id: ctx.data.seller_id as string,
          assignee_id: ctx.data.buyer_id as string,
          entity_type: 'invoices',
          entity_id: invoiceId,
          title: `Pay invoice ${invoiceNum}`,
          description: `R${total.toFixed(2)} due for ${ctx.data.volume_mwh || 0} MWh matched trade. Escrow is held.`,
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        });
        await enqueueAction(db, {
          type: 'trade_delivery',
          priority: 'normal',
          actor_id: ctx.data.buyer_id as string,
          assignee_id: ctx.data.seller_id as string,
          entity_type: 'trade_matches',
          entity_id: ctx.data.match_id as string,
          title: `Deliver ${ctx.data.volume_mwh || 0} MWh`,
          description: `Confirm delivery of matched trade on ${deliveryDate}. Escrow releases on confirmation.`,
          due_date: deliveryDate,
        });
      }
      break;
    }

    case 'contract.signed': {
      // When a contract is signed by all parties, open a follow-up invoice + notify counterparty
      const contract = await db.prepare(
        'SELECT id, title, creator_id, counterparty_id, project_id, commercial_terms FROM contract_documents WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (contract) {
        await db.prepare(`UPDATE contract_documents SET phase = 'active', updated_at = ? WHERE id = ?`)
          .bind(new Date().toISOString(), ctx.entity_id).run();

        let terms: Record<string, unknown> = {};
        try { terms = JSON.parse((contract.commercial_terms as string) || '{}'); } catch { /* noop */ }
        const monthly = Number(terms.monthly_amount || terms.contract_value || 0);
        if (monthly > 0 && contract.creator_id && contract.counterparty_id) {
          const invoiceId = generateId();
          const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
          const subtotal = monthly / 1.15;
          const vat = monthly - subtotal;
          const period = new Date().toISOString().split('T')[0];
          await db.prepare(`
            INSERT INTO invoices (id, invoice_number, project_id, from_participant_id, to_participant_id,
              invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount,
              total_amount, due_date, status, tenant_id, issued_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'energy', ?, ?, ?, ?, 0.15, ?, ?, ?, 'issued', 'default', ?, ?, ?)
          `).bind(
            invoiceId, invoiceNum, contract.project_id || null, contract.creator_id, contract.counterparty_id,
            period, period, JSON.stringify([{ description: `${contract.title} — month 1`, amount: monthly }]),
            subtotal, vat, monthly,
            new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
          ).run();

          await enqueueAction(db, {
            type: 'invoice_payment',
            priority: 'high',
            actor_id: contract.creator_id as string,
            assignee_id: contract.counterparty_id as string,
            entity_type: 'invoices',
            entity_id: invoiceId,
            title: `Pay invoice ${invoiceNum} — ${contract.title}`,
            description: `R${monthly.toFixed(2)} first instalment due for signed contract ${contract.title}.`,
            due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          });
        }

        await enqueueAction(db, {
          type: 'contract_activate',
          priority: 'normal',
          actor_id: ctx.actor_id,
          assignee_id: (contract.creator_id as string),
          entity_type: 'contract_documents',
          entity_id: ctx.entity_id,
          title: `Contract ${contract.title} is fully signed`,
          description: 'All signatories signed. Upload a signed PDF to the vault and kick off delivery scheduling.',
        });
      }
      break;
    }

    case 'invoice.issued': {
      const inv = await db.prepare(
        'SELECT id, invoice_number, from_participant_id, to_participant_id, total_amount, due_date FROM invoices WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (inv?.to_participant_id) {
        await enqueueAction(db, {
          type: 'invoice_payment',
          priority: 'high',
          actor_id: inv.from_participant_id as string,
          assignee_id: inv.to_participant_id as string,
          entity_type: 'invoices',
          entity_id: inv.id as string,
          title: `Pay invoice ${inv.invoice_number}`,
          description: `R${Number(inv.total_amount || 0).toFixed(2)} due by ${inv.due_date || 'N/A'}.`,
          due_date: (inv.due_date as string) || null,
        });
      }
      break;
    }

    case 'invoice.paid': {
      const inv = await db.prepare(
        'SELECT id, match_id, from_participant_id, to_participant_id FROM invoices WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (inv?.match_id) {
        // release escrow on match
        await db.prepare(
          `UPDATE escrow_accounts SET status = 'released', released_at = ?, updated_at = ? WHERE match_id = ? AND status = 'held'`
        ).bind(new Date().toISOString(), new Date().toISOString(), inv.match_id).run();
        await db.prepare(
          `UPDATE trade_matches SET status = 'settled' WHERE id = ?`
        ).bind(inv.match_id).run();
      }
      // mark action queue items for this invoice complete
      await db.prepare(
        `UPDATE action_queue SET status = 'completed', completed_at = ? WHERE entity_type = 'invoices' AND entity_id = ? AND status = 'pending'`
      ).bind(new Date().toISOString(), ctx.entity_id).run();
      break;
    }

    case 'contract.phase_changed': {
      // `execution` is the phase at which contract signatories are notified
      // — matches the CHECK constraint on contract_documents.phase in 001_core.
      if (ctx.data?.new_phase === 'execution') {
        const signatories = await db.prepare(
          `SELECT participant_id FROM document_signatories WHERE document_id = ? AND signed = 0`
        ).bind(ctx.entity_id).all();
        for (const s of signatories.results || []) {
          await enqueueAction(db, {
            type: 'contract_sign',
            priority: 'high',
            actor_id: ctx.actor_id,
            assignee_id: (s as { participant_id: string }).participant_id,
            entity_type: 'contract_documents',
            entity_id: ctx.entity_id,
            title: 'Contract awaiting your signature',
            description: `Contract ${ctx.entity_id} has been sent for signing.`,
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          });
        }
      }
      break;
    }

    case 'dispute.filed': {
      if (ctx.data?.match_id) {
        await db.prepare(`
          UPDATE escrow_accounts SET status = 'disputed', updated_at = ?
          WHERE match_id = ? AND status = 'held'
        `).bind(new Date().toISOString(), ctx.data.match_id).run();
      }
      const admins = await db.prepare(`SELECT id FROM participants WHERE role = 'admin'`).all();
      for (const a of admins.results || []) {
        await enqueueAction(db, {
          type: 'dispute_review',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: (a as { id: string }).id,
          entity_type: 'invoices',
          entity_id: ctx.entity_id,
          title: 'Review dispute',
          description: `Dispute filed: ${(ctx.data?.reason as string) || 'No reason provided'}`,
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        });
      }
      break;
    }

    case 'ipp.milestone_satisfied': {
      // If milestone is financial_close, cascade to ipp.financial_close
      if (ctx.data?.milestone_type === 'financial_close') {
        await fireCascade({
          event: 'ipp.financial_close',
          actor_id: ctx.actor_id,
          entity_type: 'ipp_projects',
          entity_id: (ctx.data?.project_id as string) || ctx.entity_id,
          data: { project_name: ctx.data?.project_name },
          env: ctx.env,
        });
      }
      // Auto-queue disbursement approval for lenders
      const lenders = await db.prepare(`SELECT id FROM participants WHERE role = 'lender'`).all();
      for (const l of lenders.results || []) {
        await enqueueAction(db, {
          type: 'disbursement_approval',
          priority: 'high',
          actor_id: ctx.actor_id,
          assignee_id: (l as { id: string }).id,
          entity_type: 'project_milestones',
          entity_id: ctx.entity_id,
          title: `Approve disbursement for ${ctx.data?.milestone_name || 'milestone'}`,
          description: `Milestone "${ctx.data?.milestone_name || ctx.entity_id}" satisfied; review CPs and release disbursement.`,
          due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        });
      }
      break;
    }
    
    case 'ona.fault_detected': {
      // Calculate and store revenue impact
      const severityMultiplier = { low: 0.5, medium: 1, high: 2, critical: 5 };
      const multiplier = severityMultiplier[ctx.data?.severity as keyof typeof severityMultiplier] || 1;
      const ppaValue = Number(ctx.data?.ppa_value_per_day ?? 50000);
      const dailyImpact = ppaValue * multiplier;
      
      // Update fault with estimated impact
      await ctx.env.DB.prepare(`
        UPDATE ona_faults SET estimated_revenue_impact = ?, updated_at = ?
        WHERE id = ?
      `).bind(dailyImpact, new Date().toISOString(), ctx.entity_id).run();
      
      // Create intelligence item
      await ctx.env.DB.prepare(`
        INSERT INTO intelligence_items (id, type, severity, title, description, entity_type, entity_id, action_required, created_at)
        VALUES (?, 'operational', 'critical', ?, ?, 'ona_faults', ?, ?, ?)
      `).bind(
        generateId(),
        `Fault: ${ctx.data?.fault_description || 'Unknown'}`,
        `Revenue at risk: R${dailyImpact.toLocaleString()}/day. Site: ${ctx.data?.site_name || ctx.entity_id}`,
        ctx.entity_id,
        'Review fault and submit insurance claim if applicable',
        new Date().toISOString()
      ).run();
      
      // Create action queue for IPP
      const site = await ctx.env.DB.prepare('SELECT project_id FROM ona_sites WHERE id = ?').bind(ctx.data?.site_id).first();
      if (site) {
        const proj = await ctx.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(site.project_id).first();
        if (proj) {
          await ctx.env.DB.prepare(`
            INSERT INTO action_queue (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status, due_date, created_at)
            VALUES (?, 'fault_review', 'urgent', ?, ?, 'ona_faults', ?, ?, ?, 'pending', ?, ?)
          `).bind(
            generateId(), ctx.actor_id, proj.developer_id, ctx.entity_id,
            `View Fault: ${ctx.data?.fault_description || 'Unknown'}`,
            `Revenue impact: R${dailyImpact.toLocaleString()}/day. Request disbursement adjustment if necessary.`,
            new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
            new Date().toISOString()
          ).run();
        }
      }
      break;
    }
    
    case 'ipp.financial_close': {
      // Notify all linked parties about FC
      const proj = await ctx.env.DB.prepare('SELECT * FROM ipp_projects WHERE id = ?').bind(ctx.entity_id).first();
      if (proj) {
        // Notify grid operator if connection exists
        const connection = await ctx.env.DB.prepare('SELECT id FROM grid_connections WHERE project_id = ?').bind(ctx.entity_id).first();
        if (connection) {
          const gridOps = await ctx.env.DB.prepare("SELECT id FROM participants WHERE role = 'grid_operator'").all();
          for (const op of gridOps.results || []) {
            await ctx.env.DB.prepare(`
              INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
              VALUES (?, ?, 'grid', ?, ?, ?, ?)
            `).bind(
              generateId(), op.id, 'FC Declared — Prepare Grid Connection',
              `Project ${proj.project_name} has achieved Financial Close. Prepare for grid connection.`,
              JSON.stringify({ project_id: ctx.entity_id, cod: proj.commercial_operation_date }),
              new Date().toISOString()
            ).run();
          }
        }
        
        // Notify offtakers with contracts
        const contracts = await ctx.env.DB.prepare('SELECT counterparty_id FROM contract_documents WHERE project_id = ?').bind(ctx.entity_id).all();
        for (const c of contracts.results || []) {
          await ctx.env.DB.prepare(`
            INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
            VALUES (?, ?, 'contract', ?, ?, ?, ?)
          `).bind(
            generateId(), c.counterparty_id, 'FC Declared — COD Expected',
            `Project ${proj.project_name} has achieved Financial Close. Expected COD: ${proj.commercial_operation_date}`,
            JSON.stringify({ project_id: ctx.entity_id, cod: proj.commercial_operation_date }),
            new Date().toISOString()
          ).run();
        }
      }
      break;
    }
    
    case 'esg.decarbonisation_completed': {
      // Recalculate ESG score
      const participantId = ctx.data?.participant_id;
      if (participantId) {
        // Calculate new score based on updated emissions
        const emissions = await ctx.env.DB.prepare(`
          SELECT SUM(value) as total FROM esg_data 
          WHERE participant_id = ? AND metric_id IN ('esg_met_001','esg_met_002','esg_met_003')
        `).bind(participantId).first();
        
        const totalEmissions = Number(emissions?.total ?? 0);
        const prevEmissions = Number(ctx.data?.previous_emissions ?? 0);

        // Update or create score record
        const existing = await ctx.env.DB.prepare('SELECT id FROM esg_reports WHERE participant_id = ? ORDER BY created_at DESC LIMIT 1').bind(participantId).first();
        if (existing) {
          await ctx.env.DB.prepare(`
            UPDATE esg_reports SET total_ghg_emissions_tco2e = ?, updated_at = ? WHERE id = ?
          `).bind(totalEmissions, new Date().toISOString(), existing.id).run();
        }

        // Intelligence item if significant change
        if (prevEmissions && Math.abs(totalEmissions - prevEmissions) > 500) {
          const reduction = prevEmissions - totalEmissions;
          await ctx.env.DB.prepare(`
            INSERT INTO intelligence_items (id, participant_id, type, severity, title, description, created_at)
            VALUES (?, ?, 'esg', 'info', ?, ?, ?)
          `).bind(
            generateId(), participantId,
            `Scope ${ctx.data?.scope || 'unknown'} Emissions Reduced`,
            `Emissions reduced by ${reduction.toLocaleString()} tCO₂e`,
            new Date().toISOString()
          ).run();
        }
      }
      break;
    }

    // ─── National-scale action items ──────────────────────────────────
    // Each action enqueues a pending item for the affected participant's
    // dashboard. Due dates are capped so the item ages out of the queue.
    case 'regulator.licence_suspended':
    case 'regulator.licence_revoked': {
      const pid = ctx.data?.licensee_participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'regulatory_action',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: ctx.entity_type,
          entity_id: ctx.entity_id,
          title: ctx.event === 'regulator.licence_revoked' ? 'Licence revoked — cease operations' : 'Licence suspended — halt activities under this licence',
          description: `Details: ${ctx.data?.details || 'Consult the Regulator workbench for the event record.'}`,
          due_date: new Date().toISOString().slice(0, 10),
        });
      }
      break;
    }

    case 'regulator.enforcement_finding': {
      const pid = ctx.data?.respondent_participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'enforcement_finding',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'regulator_enforcement_cases',
          entity_id: ctx.entity_id,
          title: `Enforcement finding: ${ctx.data?.case_number || ctx.entity_id}`,
          description: `Penalty: R${(ctx.data?.penalty_amount_zar as number) || 0}. Consider appeal within statutory window.`,
          due_date: daysFromNow(30),
        });
      }
      break;
    }

    case 'regulator.surveillance_escalated': {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'surveillance_escalation',
          priority: 'high',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'regulator_enforcement_cases',
          entity_id: (ctx.data?.case_id as string) || ctx.entity_id,
          title: `Case opened: ${ctx.data?.case_number || ctx.entity_id}`,
          description: `Surveillance rule ${ctx.data?.rule_code || ''} escalated to enforcement. Respond to the investigating officer.`,
          due_date: daysFromNow(14),
        });
      }
      break;
    }

    case 'grid.instruction_issued': {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'dispatch_acknowledge',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'dispatch_instructions',
          entity_id: ctx.entity_id,
          title: `Acknowledge dispatch: ${ctx.data?.instruction_number || ''}`,
          description: `${ctx.data?.instruction_type || 'Action required'} — target ${ctx.data?.target_mw ?? 0} MW effective ${ctx.data?.effective_from || 'now'}.`,
          due_date: daysFromNow(1),
        });
      }
      break;
    }

    case 'grid.instruction_non_compliant': {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'non_compliance',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'dispatch_instructions',
          entity_id: ctx.entity_id,
          title: 'Dispatch non-compliance — review and respond',
          description: `Penalty assessed: R${(ctx.data?.penalty_amount_zar as number) || 0}. Provide evidence or appeal.`,
          due_date: daysFromNow(7),
        });
      }
      break;
    }

    case 'trader.margin_call_issued': {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'margin_call',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'margin_calls',
          entity_id: ctx.entity_id,
          title: 'Margin call — post collateral',
          description: `Shortfall R${(ctx.data?.shortfall_zar as number) || 0}. Due by ${ctx.data?.due_by || 'end of next business day'}.`,
          due_date: typeof ctx.data?.due_by === 'string'
            ? (ctx.data.due_by as string).slice(0, 10)
            : daysFromNow(1),
        });
      }
      break;
    }

    case 'lender.covenant_breach': {
      // Notify both the lender and the project developer. Both assignees
      // get the same action structure so we build the list up-front and
      // batch the INSERTs into a single env.DB.batch() call.
      const lenderId = ctx.data?.lender_participant_id as string | null;
      const projectId = ctx.data?.project_id as string | null;
      const code = ctx.data?.covenant_code as string || '';
      const title = `Covenant breach: ${code}`;
      const desc = `Measured ${ctx.data?.measured_value ?? '—'} vs threshold ${ctx.data?.threshold ?? '—'} for ${ctx.data?.test_period || 'current period'}.`;
      const assignments: EnqueueActionInput[] = [];
      if (lenderId) {
        assignments.push({
          type: 'covenant_breach',
          priority: ctx.data?.material_adverse_effect ? 'urgent' : 'high',
          actor_id: ctx.actor_id,
          assignee_id: lenderId,
          entity_type: 'covenant_tests',
          entity_id: ctx.entity_id,
          title,
          description: desc,
          due_date: daysFromNow(7),
        });
      }
      if (projectId) {
        const dev = await cachedProjectDeveloper(ctx.env, projectId);
        if (dev) {
          assignments.push({
            type: 'covenant_breach',
            priority: 'high',
            actor_id: ctx.actor_id,
            assignee_id: dev,
            entity_type: 'covenant_tests',
            entity_id: ctx.entity_id,
            title: `Action: ${title}`,
            description: `${desc} — consider requesting a waiver or remedial plan.`,
            due_date: daysFromNow(7),
          });
        }
      }
      if (assignments.length > 0) await enqueueActions(ctx.env.DB, assignments);
      break;
    }

    case 'ipp.insurance_expiring': {
      const projectId = ctx.data?.project_id as string | null;
      if (projectId) {
        const dev = await cachedProjectDeveloper(ctx.env, projectId);
        if (dev) {
          await enqueueAction(ctx.env.DB, {
            type: 'insurance_renewal',
            priority: 'high',
            actor_id: ctx.actor_id,
            assignee_id: dev,
            entity_type: 'insurance_policies',
            entity_id: ctx.entity_id,
            title: `Insurance renewal due: ${ctx.data?.policy_number || ctx.entity_id}`,
            description: `Policy expires ${ctx.data?.period_end || 'soon'}. Lender covenant requires continuous cover.`,
            due_date: typeof ctx.data?.period_end === 'string'
              ? (ctx.data.period_end as string).slice(0, 10)
              : daysFromNow(30),
          });
        }
      }
      break;
    }

    case 'carbon.mrv_verified': {
      const pid = ctx.data?.submitted_by as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'mrv_followup',
          priority: 'normal',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'mrv_verifications',
          entity_id: ctx.entity_id,
          title: `MRV verified: ${ctx.data?.opinion || 'positive'}`,
          description: `Verified ${ctx.data?.verified_reductions_tco2e ?? '—'} tCO₂e. Request issuance with your chosen registry.`,
          due_date: daysFromNow(30),
        });
      }
      break;
    }
  }

  // Wave 6: auto-add to lender watchlist + issue cycle-1 dunning notice
  // on covenant breach. Non-fatal — primary cascade work already done.
  try {
    await materializeLenderWatchlist(ctx);
  } catch (err) {
    console.error('lender-watchlist materializer failed', err);
  }

  // Wave 5: regulator-inbox materializer. Any event in the curated allowlist
  // below lands a row in oe_regulator_inbox so the regulator can ack /
  // escalate / dismiss it with an SLA. Failures here are non-fatal — the
  // primary cascade work already completed.
  try {
    await materializeRegulatorInbox(ctx);
  } catch (err) {
    console.error('regulator-inbox materializer failed', err);
  }
}

/**
 * Wave 5 — regulator observation loop.
 *
 * Maps a curated set of regulator-relevant cascade events into a single
 * row in oe_regulator_inbox so the regulator gets one place to ack +
 * triage them. `sla_due_at` is derived from the resolved severity (see
 * SLA_HOURS_BY_SEVERITY in regulator-inbox-spec.ts).
 *
 * The escalation cron scans rows where ack_status='pending' and
 * sla_due_at is in the past, then bumps them to 'escalated' (and, for
 * rules with on_breach='open_case', opens an enforcement case).
 */
async function materializeRegulatorInbox(ctx: CascadeContext): Promise<void> {
  const spec = regulatorInboxSpec(ctx.event, ctx.entity_id, ctx.data);
  if (!spec) return;

  const now = new Date();
  const dueAt = computeSlaDueAt(spec.severity, now);

  await ctx.env.DB.prepare(`
    INSERT INTO oe_regulator_inbox
      (id, source_event, source_entity_type, source_entity_id, severity,
       title, body_json, ack_status, sla_due_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).bind(
    generateId(),
    ctx.event,
    ctx.entity_type,
    ctx.entity_id,
    spec.severity,
    spec.title,
    JSON.stringify(ctx.data || {}),
    dueAt,
    now.toISOString(),
    now.toISOString(),
  ).run();
}

/**
 * Wave 6 — lender dunning materialiser.
 *
 * On covenant_breach / covenant_warn events we auto-add the affected
 * facility/borrower to the lender watchlist (if not already present)
 * and issue a cycle-1 dunning notice with a 14-day cure deadline.
 *
 * Subsequent cycle escalation happens via the
 * `lender_dunning_overdue_sweep` cron in src/index.ts.
 */
async function materializeLenderWatchlist(ctx: CascadeContext): Promise<void> {
  if (ctx.event !== 'lender.covenant_breach' && ctx.event !== 'lender.covenant_warn') return;
  const data = ctx.data || {};
  const facilityId = (data as any).facility_id as string | undefined;
  const borrowerId =
    (data as any).borrower_id as string | undefined ||
    (data as any).borrower_participant_id as string | undefined ||
    (data as any).participant_id as string | undefined;
  if (!facilityId || !borrowerId) return;

  // Avoid duplicate dunning if an open watchlist row already exists for
  // this facility + borrower.
  const existing = await ctx.env.DB
    .prepare(`SELECT id FROM oe_lender_watchlist WHERE facility_id = ? AND participant_id = ? AND cleared_at IS NULL LIMIT 1`)
    .bind(facilityId, borrowerId)
    .first() as { id: string } | null;

  const now = new Date();
  const init = initialDunningCycle(now);
  const triggerSignal = ctx.event === 'lender.covenant_breach' ? 'covenant_breach' : 'covenant_warn';
  const triggerValue = Number((data as any).measured_value ?? (data as any).threshold ?? 0) || null;

  let watchlistId: string;
  if (existing?.id) {
    watchlistId = existing.id;
  } else {
    watchlistId = generateId();
    await ctx.env.DB.prepare(`
      INSERT INTO oe_lender_watchlist
        (id, facility_id, participant_id, watchlist_tier, trigger_signal, trigger_value,
         action_plan, added_at, next_review_at, added_by,
         cure_deadline_at, dunning_cycle, auto_escalated_at, borrower_acked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).bind(
      watchlistId,
      facilityId,
      borrowerId,
      init.tier,
      triggerSignal,
      triggerValue,
      `Auto-added from ${ctx.event} cascade.`,
      now.toISOString(),
      init.cure_deadline_at,
      ctx.actor_id || 'system',
      init.cure_deadline_at,
      init.cycle,
    ).run();
    await ctx.env.DB.prepare(`
      INSERT INTO oe_lender_watchlist_events
        (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
      VALUES (?, ?, 'added', NULL, ?, ?, ?, ?)
    `).bind(generateId(), watchlistId, init.tier, ctx.actor_id || 'system',
            `Initial entry from ${ctx.event}`, now.toISOString()).run();
  }

  // Issue the cycle-1 dunning notice.
  const noticeId = generateId();
  const body = {
    covenant: (data as any).covenant_code || null,
    threshold: (data as any).threshold ?? null,
    measured: (data as any).measured_value ?? null,
    period: (data as any).test_period || null,
    source_event: ctx.event,
  };
  await ctx.env.DB.prepare(`
    INSERT INTO oe_lender_dunning_notices
      (id, watchlist_id, facility_id, borrower_id, cycle, trigger_signal,
       title, body_json, status, issued_at, issued_by, cure_deadline_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?)
  `).bind(
    noticeId,
    watchlistId,
    facilityId,
    borrowerId,
    init.cycle,
    triggerSignal,
    `Covenant ${triggerSignal.replace('_', ' ')} — cycle 1 notice`,
    JSON.stringify(body),
    now.toISOString(),
    ctx.actor_id || 'system',
    init.cure_deadline_at,
  ).run();

  await ctx.env.DB.prepare(`
    INSERT INTO oe_lender_watchlist_events
      (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
    VALUES (?, ?, 'dunning_issued', ?, ?, ?, ?, ?)
  `).bind(generateId(), watchlistId, init.tier, init.tier, ctx.actor_id || 'system',
          `Cycle ${init.cycle} notice ${noticeId} issued`, now.toISOString()).run();
}

/** Days-from-now helper for action_queue.due_date (YYYY-MM-DD). */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function generateId(): string {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

interface EnqueueActionInput {
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  actor_id?: string;
  assignee_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
}

async function enqueueAction(db: any, input: EnqueueActionInput): Promise<void> {
  await enqueueActions(db, [input]);
}

/**
 * Batched variant — inserts many action_queue rows in a single
 * env.DB.batch() round-trip. Used by cascade special handlers that
 * assign the same event to multiple participants (covenant breach →
 * lender + developer; ancillary award → N winners; enforcement
 * finding → several investigators).
 *
 * Fallback to per-row INSERTs if batch() fails so forward progress is
 * preserved.
 */
async function enqueueActions(db: any, inputs: EnqueueActionInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const now = new Date().toISOString();
  const stmts = inputs.map((input) =>
    db.prepare(`
      INSERT INTO action_queue
        (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      generateId(),
      input.type,
      input.priority,
      input.actor_id || null,
      input.assignee_id,
      input.entity_type,
      input.entity_id,
      input.title,
      input.description || null,
      input.due_date || null,
      now,
      now,
    ),
  );
  try {
    if (typeof db.batch === 'function') {
      await db.batch(stmts);
      return;
    }
  } catch (err) {
    console.warn('action_queue_batch_failed', (err as Error).message);
  }
  // Fallback: sequential.
  for (const stmt of stmts) {
    try { await stmt.run(); } catch (err) { console.error('Action queue enqueue failed:', err); }
  }
}