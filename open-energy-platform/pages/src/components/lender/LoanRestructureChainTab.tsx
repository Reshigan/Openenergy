// Wave 108 — Lender Loan Restructure & Amendment-and-Extend (A&E) /
// Forbearance Chain tab.
//
// 11th Lender chain. Fills the STRUCTURED-FORBEARANCE gap between W38
// covenant certificate (point-in-time breach detection) + W86 DSCR
// monitoring (rolling coverage watch) and W45 default enforcement
// (acceleration / step-in). Without W108 every breach escalates straight
// to acceleration — that kills bankability. Restructure is the
// renegotiation runway every project-finance loan needs at least once in
// its life.
//
// 12-state P6 lifecycle plus 3 terminal branches:
//   trigger_event → preliminary_assessment → restructure_proposal_drafted
//     → lender_credit_committee_review → borrower_term_sheet_negotiation
//     → term_sheet_signed → legal_documentation_drafted
//     → consent_solicitation → signing → effective_date
//     → monitoring_period → completed (hard terminal)
//
// Branches:
//   credit_committee_review → restructure_proposal_drafted (revise_proposal loop)
//   credit_committee_review → rejected_by_committee (terminal)
//   any pre-effective state → abandoned (terminal — borrower withdraws)
//   any non-terminal state → escalated_to_default (terminal — feeds W45)
//
// INVERTED SLA polarity stored as HOURS — systemic = LONGEST runway. Tier
// RE-DERIVED on every transition from facility_amount_zar with FLOOR-AT-
// MATERIAL on any one of 5 floor flags and FLOOR-AT-SYSTEMIC on 2+ flags
// OR public_bondholder OR SARB large exposure.
//
// SIGNATURE — escalate_to_default crosses the regulator EVERY tier (W108
// hard line, failed restructure feeding W45 — universally reportable).
// submit_to_credit_committee crosses EVERY tier on systemic OR
// ifrs9_stage_3 (Companies Act §155 Compromise). mark_effective crosses
// material+systemic (SARB Banks Act §61 large-exposure disclosure).
// launch_consent_solicitation crosses strategic on public_bondholder
// only. sla_breached crosses material+systemic.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'trigger_event' | 'preliminary_assessment' | 'restructure_proposal_drafted'
  | 'lender_credit_committee_review' | 'borrower_term_sheet_negotiation'
  | 'term_sheet_signed' | 'legal_documentation_drafted' | 'consent_solicitation'
  | 'signing' | 'effective_date' | 'monitoring_period' | 'completed'
  | 'rejected_by_committee' | 'abandoned' | 'escalated_to_default';

type Tier = 'minor' | 'standard' | 'material' | 'systemic';
type Urgency = 'critical' | 'high' | 'medium' | 'low';
type ConsentSeverity = 'simple_majority' | 'special_majority' | 'super_majority' | 'unanimity';
type Authority =
  | 'relationship_manager' | 'credit_committee' | 'portfolio_director'
  | 'CRO' | 'board_credit_subcommittee';

interface LrsRow {
  [key: string]: unknown;
  id: string;
  restructure_number: string;
  facility_id: string;
  facility_name: string | null;
  borrower_id: string;
  borrower_name: string | null;
  lender_agent_id: string;
  lender_agent_name: string | null;
  project_id: string | null;
  project_name: string | null;
  syndicate_size: number;
  facility_amount_zar: number;
  outstanding_debt_zar: number;
  debt_service_per_month_zar: number;
  trigger_reason_code: string | null;
  trigger_narrative: string | null;
  covenant_breach_ref: string | null;
  dscr_shortfall_ref: string | null;
  default_chain_ref: string | null;
  forbearance_period_months: number;
  principal_reschedule_zar: number;
  principal_reschedule_pct: number;
  maturity_extension_months: number;
  equity_cure_quantum_zar: number;
  proposed_relief_zar: number;
  consent_severity: ConsentSeverity | null;
  consent_threshold_pct: number;
  consent_majority_pct: number;
  syndicate_consented: number;
  consent_deadline_at: string | null;
  consent_majority_passed: number;
  cross_border_syndicate: number;
  sustainability_linked_loan: number;
  public_bondholder_consent_required: number;
  ifrs9_stage_3_at_trigger: number;
  sarb_large_exposure_threshold: number;
  was_on_watch_at_trigger: number;
  ifrs9_stage_at_trigger: number;
  current_tier: Tier;
  authority_required: Authority | null;
  board_escalation_required: number;
  urgency_band: string | null;
  restructure_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  cancel_reason: string | null;
  rejection_reason: string | null;
  abandon_reason: string | null;
  escalation_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  trigger_event_at: string | null;
  preliminary_assessment_at: string | null;
  restructure_proposal_drafted_at: string | null;
  lender_credit_committee_review_at: string | null;
  borrower_term_sheet_negotiation_at: string | null;
  term_sheet_signed_at: string | null;
  legal_documentation_drafted_at: string | null;
  consent_solicitation_at: string | null;
  signing_at: string | null;
  effective_date_at: string | null;
  monitoring_period_at: string | null;
  completed_at: string | null;
  rejected_by_committee_at: string | null;
  abandoned_at: string | null;
  escalated_to_default_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated LIVE fields.
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  hours_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: Urgency;
  authority_required_live?: Authority;
  board_escalation_required_live?: boolean;
  regulator_filing_window_hours_live?: number;
  consent_threshold_pct_live?: number;
  consent_majority_pct_live?: number;
  consent_majority_passed_live?: boolean;
  days_to_consent_deadline_live?: number | null;
  floor_flag_count_live?: number;
  proposed_relief_zar_live?: number;
  principal_reschedule_pct_live?: number;
  ifrs9_stage_at_trigger_live?: 1 | 2 | 3;
  restructure_completeness_index_live?: number;
  bridges_to_covenant_certificate_chain_live?: boolean;
  bridges_to_dscr_monitoring_chain_live?: boolean;
  bridges_to_default_chain_live?: boolean;
}

interface LrsEvent {
  id: string;
  restructure_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  active_count: number;
  completed_count: number;
  escalated_count: number;
  rejected_count: number;
  abandoned_count: number;
  systemic_count: number;
  material_count: number;
  breached: number;
  reportable_total: number;
  consent_open_count: number;
  consent_passed_count: number;
  ifrs9_stage_3_count: number;
  public_bondholder_count: number;
  sarb_le_count: number;
  covenant_bridged_count: number;
  dscr_bridged_count: number;
  default_bridged_count: number;
  board_escalated_count: number;
  total_facility_zar: number;
  total_relief_zar: number;
  total_outstanding_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'trigger_event',
  'preliminary_assessment',
  'restructure_proposal_drafted',
  'lender_credit_committee_review',
  'borrower_term_sheet_negotiation',
  'term_sheet_signed',
  'legal_documentation_drafted',
  'consent_solicitation',
  'signing',
  'effective_date',
  'monitoring_period',
  'completed',
];

const BRANCH_STATES: readonly string[] = [
  'rejected_by_committee',
  'abandoned',
  'escalated_to_default',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                            label: 'Open' },
  { key: 'all',                             label: 'All' },
  { key: 'minor',                           label: 'Minor' },
  { key: 'standard',                        label: 'Standard' },
  { key: 'material',                        label: 'Material' },
  { key: 'systemic',                        label: 'Systemic' },
  { key: 'trigger_event',                   label: 'Triggered' },
  { key: 'preliminary_assessment',          label: 'Prelim assessment' },
  { key: 'restructure_proposal_drafted',    label: 'Proposal' },
  { key: 'lender_credit_committee_review',  label: 'Committee' },
  { key: 'borrower_term_sheet_negotiation', label: 'TS negotiation' },
  { key: 'term_sheet_signed',               label: 'TS signed' },
  { key: 'legal_documentation_drafted',     label: 'Documentation' },
  { key: 'consent_solicitation',            label: 'Consent' },
  { key: 'signing',                         label: 'Signing' },
  { key: 'effective_date',                  label: 'Effective' },
  { key: 'monitoring_period',               label: 'Monitoring' },
  { key: 'completed',                       label: 'Completed' },
  { key: 'rejected_by_committee',           label: 'Rejected' },
  { key: 'abandoned',                       label: 'Abandoned' },
  { key: 'escalated_to_default',            label: 'Escalated' },
  { key: 'breached',                        label: 'SLA breached' },
  { key: 'reportable',                      label: 'Reportable' },
  { key: 'consent_open',                    label: 'Awaiting consent' },
  { key: 'critical',                        label: 'Critical urgency' },
  { key: 'ifrs9_3',                         label: 'IFRS 9 Stage 3' },
  { key: 'public_bondholder',               label: 'Public bondholder' },
  { key: 'sarb_le',                         label: 'SARB large exposure' },
  { key: 'covenant_bridged',                label: 'Covenant bridge' },
  { key: 'dscr_bridged',                    label: 'DSCR bridge' },
  { key: 'board_escalated',                 label: 'Board escalation' },
];

// ── helpers ───────────────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['completed', 'rejected_by_committee', 'abandoned', 'escalated_to_default'];

const AUTHORITY_LABEL: Record<Authority, string> = {
  relationship_manager:      'Relationship manager',
  credit_committee:          'Credit committee',
  portfolio_director:        'Portfolio director',
  CRO:                       'CRO',
  board_credit_subcommittee: 'Board credit subcommittee',
};

const CONSENT_LABEL: Record<ConsentSeverity, string> = {
  simple_majority:  'Simple majority (50%)',
  special_majority: 'Special majority (66.7%)',
  super_majority:   'Super majority (75%)',
  unanimity:        'Unanimity (100%)',
};

function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  if (Math.abs(h) >= 720) return `${Math.round(h / 720)}mo`;
  if (Math.abs(h) >= 24)  return `${Math.round(h / 24)}d`;
  return `${h}h`;
}

function fmtDays(d: number | null | undefined): string {
  if (d === null || d === undefined) return '—';
  if (Math.abs(d) >= 365) return `${(d / 365).toFixed(1)}y`;
  if (Math.abs(d) >= 30)  return `${Math.round(d / 30)}mo`;
  return `${d}d`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000)     return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000)         return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtPct(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `${n.toFixed(dp)}%`;
}

function fmtNum(n: number | null | undefined, dp = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(dp);
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: LrsRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'trigger_event') {
    actions.push({
      key: 'start-preliminary-assessment',
      label: 'Start preliminary assessment (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — lender desk opening preliminary forbearance assessment', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt (terminal — only pre-effective states)', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason (e.g. borrower_withdrawal / alternative_finance / refinance_completed)', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default; failed restructure feeds the default enforcement chain. SIGNATURE — crosses regulator EVERY tier (Basel III IFRS 9 Stage 3 + LMA event of default + SARB Banks Act §61)', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason (e.g. consent_failed / borrower_default / restructure_unworkable / abandoned_mid_cure)', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional, leave blank to create new)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'preliminary_assessment') {
    actions.push({
      key: 'draft-proposal',
      label: 'Draft restructure proposal (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — drafting restructure proposal (forbearance window, principal reschedule, maturity extension)', type: 'textarea', required: true },
        { key: 'forbearance_period_months', label: 'Forbearance period (months)', type: 'number', required: false, placeholder: String(row.forbearance_period_months ?? 0) },
        { key: 'principal_reschedule_zar', label: 'Principal reschedule amount (ZAR)', type: 'number', required: false, placeholder: String(row.principal_reschedule_zar ?? 0) },
        { key: 'maturity_extension_months', label: 'Maturity extension (months)', type: 'number', required: false, placeholder: String(row.maturity_extension_months ?? 0) },
        { key: 'equity_cure_quantum_zar', label: 'Equity cure quantum (ZAR, 0 if none)', type: 'number', required: false, placeholder: String(row.equity_cure_quantum_zar ?? 0) },
        { key: 'consent_severity', label: 'Consent severity — simple_majority / special_majority / super_majority / unanimity', type: 'text', required: false, placeholder: row.consent_severity || 'special_majority' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt (terminal — only pre-effective states)', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason (e.g. borrower_withdrawal / alternative_finance / refinance_completed)', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default; failed restructure feeds the default enforcement chain. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'restructure_proposal_drafted') {
    actions.push({
      key: 'submit-to-credit-committee',
      label: 'Submit to credit committee (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — submitting proposal to credit committee. Crosses regulator EVERY tier on systemic or IFRS 9 Stage 3 (Companies Act §155 Compromise)', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt (terminal — only pre-effective states)', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'lender_credit_committee_review') {
    actions.push({
      key: 'approve-proposal',
      label: 'Approve proposal (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — credit committee approval; moving to borrower term-sheet negotiation', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'revise-proposal',
      label: 'Send back for revision (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — sending proposal back for revision; returning to restructure_proposal_drafted loop', type: 'textarea', required: true },
        { key: 'forbearance_period_months', label: 'Revised forbearance period (months)', type: 'number', required: false, placeholder: String(row.forbearance_period_months ?? 0) },
        { key: 'principal_reschedule_zar', label: 'Revised principal reschedule (ZAR)', type: 'number', required: false, placeholder: String(row.principal_reschedule_zar ?? 0) },
        { key: 'maturity_extension_months', label: 'Revised maturity extension (months)', type: 'number', required: false, placeholder: String(row.maturity_extension_months ?? 0) },
        { key: 'equity_cure_quantum_zar', label: 'Revised equity cure (ZAR)', type: 'number', required: false, placeholder: String(row.equity_cure_quantum_zar ?? 0) },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject-proposal',
      label: 'Reject proposal (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — credit committee rejection (terminal)', type: 'textarea', required: true },
        { key: 'rejection_reason', label: 'Rejection reason (e.g. insufficient_relief / bankability_failed / risk_unacceptable)', type: 'text', required: false, placeholder: row.rejection_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'borrower_term_sheet_negotiation') {
    actions.push({
      key: 'negotiate-term-sheet',
      label: 'Negotiate term sheet (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower negotiating commercial terms; self-loop until sign_term_sheet', type: 'textarea', required: true },
        { key: 'forbearance_period_months', label: 'Forbearance period (months)', type: 'number', required: false, placeholder: String(row.forbearance_period_months ?? 0) },
        { key: 'principal_reschedule_zar', label: 'Principal reschedule (ZAR)', type: 'number', required: false, placeholder: String(row.principal_reschedule_zar ?? 0) },
        { key: 'maturity_extension_months', label: 'Maturity extension (months)', type: 'number', required: false, placeholder: String(row.maturity_extension_months ?? 0) },
        { key: 'equity_cure_quantum_zar', label: 'Equity cure (ZAR)', type: 'number', required: false, placeholder: String(row.equity_cure_quantum_zar ?? 0) },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'sign-term-sheet',
      label: 'Sign term sheet (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower signs term sheet; locking commercial terms before legal documentation', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'term_sheet_signed') {
    actions.push({
      key: 'draft-documentation',
      label: 'Draft amendment documentation (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — drafting amendment documentation (LMA Amend & Extend pack)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'legal_documentation_drafted') {
    actions.push({
      key: 'launch-consent-solicitation',
      label: 'Launch consent solicitation (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — launching syndicate consent solicitation. Crosses regulator strategic on public_bondholder_consent_required', type: 'textarea', required: true },
        { key: 'consent_severity', label: 'Consent severity — simple_majority / special_majority / super_majority / unanimity', type: 'text', required: false, placeholder: row.consent_severity || 'special_majority' },
        { key: 'consent_deadline_at', label: 'Consent deadline (YYYY-MM-DD or ISO 8601)', type: 'date', required: false },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'consent_solicitation') {
    actions.push({
      key: 'record-consent',
      label: 'Record syndicate consent (syndicate member)',
      fields: [
        { key: 'narrative', label: 'Basis — recording syndicate-member consent receipt', type: 'textarea', required: true },
        { key: 'syndicate_consented', label: 'Cumulative syndicate members consented', type: 'number', required: false, placeholder: String(row.syndicate_consented ?? 0) },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'sign-amendment',
      label: 'Sign amendment (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower signs the amendment (LMA Amend & Extend document)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'signing') {
    actions.push({
      key: 'mark-effective',
      label: 'Mark effective date (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — marking the restructure effective. Crosses regulator material+systemic (SARB Banks Act §61 large-exposure disclosure)', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'abandon',
      label: 'Abandon (borrower)',
      fields: [
        { key: 'narrative', label: 'Basis — borrower abandoning the restructure attempt', type: 'textarea', required: true },
        { key: 'abandon_reason', label: 'Abandon reason', type: 'text', required: false, placeholder: row.abandon_reason ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'effective_date') {
    actions.push({
      key: 'monitor-compliance',
      label: 'Monitor compliance (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — monitoring restructured-loan compliance (self-loop on monitoring_period)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'monitoring_period') {
    actions.push({
      key: 'monitor-compliance',
      label: 'Monitor compliance (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — monitoring restructured-loan compliance (self-loop on monitoring_period)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'complete-restructure',
      label: 'Complete restructure (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — first cure period complete; closing the restructure case (hard terminal)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-default',
      label: 'Escalate to default — feeds default enforcement (lender)',
      fields: [
        { key: 'narrative', label: 'Basis — escalating to default. SIGNATURE — crosses regulator EVERY tier', type: 'textarea', required: true },
        { key: 'escalation_reason', label: 'Escalation reason', type: 'text', required: false, placeholder: row.escalation_reason ?? '' },
        { key: 'default_chain_ref', label: 'Default chain ref (optional)', type: 'text', required: false, placeholder: row.default_chain_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: LrsRow): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Live forbearance battery */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Live forbearance battery (16-field)
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <DetailPair label="SLA hours remaining"      value={fmtHours(row.sla_hours_remaining_live)} />
          <DetailPair label="SLA window (status)"      value={fmtHours(row.sla_window_hours)} />
          <DetailPair label="Urgency band"             value={row.urgency_band_live ?? '—'} />
          <DetailPair label="Authority required"       value={row.authority_required_live ? AUTHORITY_LABEL[row.authority_required_live] : '—'} />
          <DetailPair label="Board escalation"         value={row.board_escalation_required_live ? 'YES' : 'No'} />
          <DetailPair label="Regulator filing window"  value={fmtHours(row.regulator_filing_window_hours_live)} />
          <DetailPair label="Consent severity"         value={row.consent_severity ? CONSENT_LABEL[row.consent_severity] : '—'} />
          <DetailPair label="Consent threshold"        value={fmtPct(row.consent_threshold_pct_live)} />
          <DetailPair label="Consent majority"         value={fmtPct(row.consent_majority_pct_live)} />
          <DetailPair label="Consent passed"           value={row.consent_majority_passed_live ? 'YES' : 'No'} />
          <DetailPair label="Days to consent deadline" value={fmtDays(row.days_to_consent_deadline_live)} />
          <DetailPair label="Floor flag count"         value={fmtNum(row.floor_flag_count_live, 0)} />
          <DetailPair label="Proposed relief (ZAR)"    value={fmtZar(row.proposed_relief_zar_live)} />
          <DetailPair label="Principal reschedule %"   value={fmtPct(row.principal_reschedule_pct_live, 2)} />
          <DetailPair label="IFRS 9 stage at trigger"  value={row.ifrs9_stage_at_trigger_live ? `Stage ${row.ifrs9_stage_at_trigger_live}` : '—'} />
          <DetailPair label="Completeness index"       value={`${row.restructure_completeness_index_live ?? 0} / 130`} />
        </div>
      </div>

      {/* Restructure terms */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Restructure terms
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <DetailPair label="Forbearance period"       value={`${row.forbearance_period_months} mo`} />
          <DetailPair label="Maturity extension"       value={`${row.maturity_extension_months} mo`} />
          <DetailPair label="Principal reschedule"     value={fmtZar(row.principal_reschedule_zar)} />
          <DetailPair label="Principal reschedule %"   value={fmtPct(row.principal_reschedule_pct, 2)} />
          <DetailPair label="Equity cure quantum"      value={fmtZar(row.equity_cure_quantum_zar)} />
          <DetailPair label="Proposed relief"          value={fmtZar(row.proposed_relief_zar)} />
          <DetailPair label="Debt service / month"     value={fmtZar(row.debt_service_per_month_zar)} />
          <DetailPair label="Outstanding debt"         value={fmtZar(row.outstanding_debt_zar)} />
          <DetailPair label="Syndicate size"           value={String(row.syndicate_size)} />
          <DetailPair label="Syndicate consented"      value={`${row.syndicate_consented} / ${row.syndicate_size}`} />
          <DetailPair label="Consent deadline"         value={fmtDate(row.consent_deadline_at)} />
          <DetailPair label="Trigger reason"           value={row.trigger_reason_code ?? '—'} />
          <DetailPair label="Cross-border syndicate"   value={row.cross_border_syndicate ? 'Yes' : 'No'} />
          <DetailPair label="Sustainability-linked"    value={row.sustainability_linked_loan ? 'Yes' : 'No'} />
          <DetailPair label="Public bondholder"        value={row.public_bondholder_consent_required ? 'Yes' : 'No'} />
          <DetailPair label="IFRS 9 Stage 3 trigger"   value={row.ifrs9_stage_3_at_trigger ? 'Yes' : 'No'} />
          <DetailPair label="SARB large exposure"      value={row.sarb_large_exposure_threshold ? 'Yes' : 'No'} />
          <DetailPair label="Was on watch at trigger"  value={row.was_on_watch_at_trigger ? 'Yes' : 'No'} />
        </div>
      </div>

      {/* Lifecycle timeline */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Lifecycle timeline
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <DetailPair label="Triggered"                value={fmtDate(row.trigger_event_at)} />
          <DetailPair label="Preliminary assessment"   value={fmtDate(row.preliminary_assessment_at)} />
          <DetailPair label="Proposal drafted"         value={fmtDate(row.restructure_proposal_drafted_at)} />
          <DetailPair label="Committee review"         value={fmtDate(row.lender_credit_committee_review_at)} />
          <DetailPair label="TS negotiation"           value={fmtDate(row.borrower_term_sheet_negotiation_at)} />
          <DetailPair label="TS signed"                value={fmtDate(row.term_sheet_signed_at)} />
          <DetailPair label="Documentation drafted"    value={fmtDate(row.legal_documentation_drafted_at)} />
          <DetailPair label="Consent solicitation"     value={fmtDate(row.consent_solicitation_at)} />
          <DetailPair label="Signing"                  value={fmtDate(row.signing_at)} />
          <DetailPair label="Effective date"           value={fmtDate(row.effective_date_at)} />
          <DetailPair label="Monitoring period"        value={fmtDate(row.monitoring_period_at)} />
          <DetailPair label="Completed"                value={fmtDate(row.completed_at)} />
          <DetailPair label="Rejected by committee"    value={fmtDate(row.rejected_by_committee_at)} />
          <DetailPair label="Abandoned"                value={fmtDate(row.abandoned_at)} />
          <DetailPair label="Escalated to default"     value={fmtDate(row.escalated_to_default_at)} />
          <DetailPair label="SLA deadline"             value={fmtDate(row.sla_deadline_at)} />
          <DetailPair label="Last SLA breach"          value={fmtDate(row.last_sla_breach_at)} />
          <DetailPair label="SLA status"               value={row.is_terminal ? '—' : (row.sla_breached_live || row.sla_breached) ? 'BREACHED' : fmtHours(row.hours_until_sla)} />
          <DetailPair label="Escalation lvl"           value={String(row.escalation_level)} />
          <DetailPair label="Reportable"               value={row.is_reportable_flag ? 'Yes' : 'No'} />
          <DetailPair label="Reason code"              value={row.reason_code ?? '—'} />
          <DetailPair label="Rejection reason"         value={row.rejection_reason ?? '—'} />
          <DetailPair label="Abandon reason"           value={row.abandon_reason ?? '—'} />
          <DetailPair label="Escalation reason"        value={row.escalation_reason ?? '—'} />
          <DetailPair label="Regulator crossed at"     value={fmtDate(row.regulator_crossed_at)} />
          <DetailPair label="Regulator ref"            value={row.regulator_ref ?? '—'} />
        </div>
      </div>

      {/* Bridges */}
      {(row.bridges_to_covenant_certificate_chain_live ||
        row.bridges_to_dscr_monitoring_chain_live ||
        row.bridges_to_default_chain_live) && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
            Chain bridges
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {row.bridges_to_covenant_certificate_chain_live && (
              <span style={{ borderRadius: 4, background: 'oklch(0.88 0.04 250)', color: TX1, fontSize: 10, fontWeight: 600, padding: '2px 8px' }}>
                Covenant {row.covenant_breach_ref ?? ''}
              </span>
            )}
            {row.bridges_to_dscr_monitoring_chain_live && (
              <span style={{ borderRadius: 4, background: 'oklch(0.88 0.04 250)', color: TX1, fontSize: 10, fontWeight: 600, padding: '2px 8px' }}>
                DSCR {row.dscr_shortfall_ref ?? ''}
              </span>
            )}
            {row.bridges_to_default_chain_live && (
              <span style={{ borderRadius: 4, background: 'oklch(0.90 0.06 20)', color: BAD, fontSize: 10, fontWeight: 600, padding: '2px 8px' }}>
                Default {row.default_chain_ref ?? '(new)'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Narrative */}
      {row.narrative && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Narrative</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap', fontSize: 11 }}>{row.narrative}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function LoanRestructureChainTab() {
  const [rows, setRows] = useState<LrsRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: LrsRow[] } & KpiSummary }>('/lender/loan-restructure/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          active_count: d.active_count,
          completed_count: d.completed_count,
          escalated_count: d.escalated_count,
          rejected_count: d.rejected_count,
          abandoned_count: d.abandoned_count,
          systemic_count: d.systemic_count,
          material_count: d.material_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          consent_open_count: d.consent_open_count,
          consent_passed_count: d.consent_passed_count,
          ifrs9_stage_3_count: d.ifrs9_stage_3_count,
          public_bondholder_count: d.public_bondholder_count,
          sarb_le_count: d.sarb_le_count,
          covenant_bridged_count: d.covenant_bridged_count,
          dscr_bridged_count: d.dscr_bridged_count,
          default_bridged_count: d.default_bridged_count,
          board_escalated_count: d.board_escalated_count,
          total_facility_zar: d.total_facility_zar,
          total_relief_zar: d.total_relief_zar,
          total_outstanding_zar: d.total_outstanding_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load loan-restructure records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')               return true;
      if (filter === 'open')              return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')          return !!(r.sla_breached_live || r.sla_breached);
      if (filter === 'reportable')        return !!r.is_reportable_flag;
      if (filter === 'consent_open')      return r.chain_status === 'consent_solicitation';
      if (filter === 'critical')          return r.urgency_band_live === 'critical';
      if (filter === 'ifrs9_3')           return !!r.ifrs9_stage_3_at_trigger;
      if (filter === 'public_bondholder') return !!r.public_bondholder_consent_required;
      if (filter === 'sarb_le')           return !!r.sarb_large_exposure_threshold;
      if (filter === 'covenant_bridged')  return !!r.bridges_to_covenant_certificate_chain_live;
      if (filter === 'dscr_bridged')      return !!r.bridges_to_dscr_monitoring_chain_live;
      if (filter === 'board_escalated')   return !!r.board_escalation_required_live;
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'systemic') {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/lender/loan-restructure/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/lender/loan-restructure/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: LrsRow; events: LrsEvent[] } }>(`/lender/loan-restructure/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: (res.data?.data?.events ?? []) as unknown as ChainEvent[] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const k = kpis;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          Loan restructure &amp; A&amp;E — the structured-forbearance runway
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 loan restructure / Amendment-and-Extend lifecycle — fills the structured-forbearance gap between
          covenant certificate + DSCR monitoring and default enforcement. INVERTED SLA polarity (systemic = LONGEST).
          SIGNATURE: escalate_to_default crosses regulator EVERY tier.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <KpiTile label="Total"               value={k?.total ?? rows.length} />
        <KpiTile label="Active"              value={k?.active_count ?? 0}           tone={(k?.active_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Awaiting consent"    value={k?.consent_open_count ?? 0}     tone={(k?.consent_open_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Completed"           value={k?.completed_count ?? 0}        tone="ok" />
        <KpiTile label="Escalated to default" value={k?.escalated_count ?? 0}        tone={(k?.escalated_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Rejected"            value={k?.rejected_count ?? 0}         tone={(k?.rejected_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Abandoned"           value={k?.abandoned_count ?? 0} />
        <KpiTile label="Systemic"            value={k?.systemic_count ?? 0}         tone={(k?.systemic_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Material"            value={k?.material_count ?? 0}         tone={(k?.material_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached"        value={k?.breached ?? 0}               tone={(k?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"          value={k?.reportable_total ?? 0}       tone={(k?.reportable_total ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="IFRS 9 Stage 3"      value={k?.ifrs9_stage_3_count ?? 0}    tone={(k?.ifrs9_stage_3_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Public bondholder"   value={k?.public_bondholder_count ?? 0} tone={(k?.public_bondholder_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="SARB large exposure" value={k?.sarb_le_count ?? 0}          tone={(k?.sarb_le_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Board escalation"    value={k?.board_escalated_count ?? 0}  tone={(k?.board_escalated_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Covenant bridge"     value={k?.covenant_bridged_count ?? 0} />
        <KpiTile label="DSCR bridge"         value={k?.dscr_bridged_count ?? 0} />
        <KpiTile label="Default bridge"      value={k?.default_bridged_count ?? 0}  tone={(k?.default_bridged_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Total facility"      value={fmtZar(k?.total_facility_zar ?? 0)} />
        <KpiTile label="Total outstanding"   value={fmtZar(k?.total_outstanding_zar ?? 0)} />
        <KpiTile label="Total relief"        value={fmtZar(k?.total_relief_zar ?? 0)} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.restructure_number}${row.is_reportable_flag ? ' ●' : ''}${row.public_bondholder_consent_required ? ' ▲' : ''}${row.ifrs9_stage_3_at_trigger ? ' ✦' : ''}${row.bridges_to_default_chain_live ? ' →Default' : ''}`}
              meta={[
                row.borrower_name ?? row.borrower_id,
                row.facility_name ?? row.facility_id,
                fmtZar(row.facility_amount_zar),
              ].filter(Boolean).join(' · ')}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No restructure cases match.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default LoanRestructureChainTab;
