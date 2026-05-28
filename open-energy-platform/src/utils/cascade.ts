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
  | 'carbon.serial_uri.resolved';

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
  rec: 'offtaker',
  rec_market: 'offtaker',
  scope2: 'offtaker',
  ipp: 'ipp',
  project: 'ipp',
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
  popia: 'admin',
  auth: 'auth',
  intelligence: 'admin',
  action_queue: 'admin',
  pcaf: 'carbon',
  maturity: 'carbon',
  anomaly: 'carbon',
  disclosure: 'esg',
  audit_chain: 'platform',
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