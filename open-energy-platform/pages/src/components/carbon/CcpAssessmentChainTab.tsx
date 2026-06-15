// Wave 91 — ICVCM CCP-eligibility Assessment & Label Lifecycle chain tab.
//
// The QUALITY-LABEL "rating" layer of the carbon-credit market — orthogonal
// to issuance (W82) / retirement (W17) / MRV (W11). After a project is
// registered (W37), the ICVCM and aligned bodies run an independent integrity
// assessment that awards the CCP-eligible (Core Carbon Principles) label,
// the market's "investment-grade" mark — premium pricing AND CORSIA Phase-2
// eligibility (mandatory for airline retirements from 2027). This tab
// surfaces the 12-state chain — requested → screening → eligibility check →
// assessment → VVB review → decision pending → ccp_label_granted (clean), with
// on_hold / returned / disputed loops, and terminal ccp_label_denied /
// withdrawn — and exposes the LIVE CCP-criteria battery that beats Sylvera /
// BeZero Carbon / Calyx Global / Renoster / Pachama — opaque proprietary
// methodologies that lag the market — via: 10-criterion aggregate, weakest-
// criterion identification, integrity-floor cross flag, CORSIA Phase-2
// eligibility, Sylvera-equivalent grade (AAA-F), premium-pricing uplift %,
// and predicted assessment days — all derived from the same inputs each
// transition.
//
// INVERTED SLA — the larger the assessed annual volume, the LONGER every
// window (deeper rating diligence); a minor assessment gets the shortest
// window. The W91 signature is INTEGRITY-MARK-driven: deny_ccp_label crosses
// to the regulator inbox for EVERY tier (public market-rejection signal);
// grant_ccp_label crosses for EVERY tier when CONDITIONAL, else for the
// large tiers (major + mega); raise_dispute and SLA breach cross for the
// large tiers only.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'requested' | 'screening' | 'eligibility_check' | 'assessment_in_progress'
  | 'vvb_review' | 'ccp_decision_pending' | 'ccp_label_granted'
  | 'on_hold' | 'returned' | 'disputed' | 'ccp_label_denied' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'major' | 'mega';

type LabelClass = 'ccp_eligible' | 'ccp_conditional' | 'ccp_not_eligible';

type Sector =
  | 'redd_plus' | 'jurisdictional' | 'avoidance'
  | 'arr' | 'improved_forest_mgmt' | 'cookstove' | 'renewable_energy'
  | 'methane' | 'industrial_gas' | 'engineered_removal' | 'soil_carbon' | 'blue_carbon';

interface AssessmentRow {
  [key: string]: unknown;
  id: string;
  assessment_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  methodology_version: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  vvb_name: string | null;
  quality_assessor_name: string | null;
  host_country: string | null;
  sector: Sector;
  assessment_tier: Tier;
  assessed_annual_tco2e: number;
  high_integrity_risk_flag: number;
  effective_governance_score: number | null;
  tracking_system_score: number | null;
  transparency_score: number | null;
  robust_quantification_score: number | null;
  no_double_counting_score: number | null;
  permanence_score: number | null;
  additionality_score: number | null;
  sustainable_development_score: number | null;
  transition_to_net_zero_score: number | null;
  safeguards_score: number | null;
  label_class: LabelClass | null;
  ccp_aggregate_score: number | null;
  gap_count: number;
  weakest_criterion: string | null;
  weakest_score: number | null;
  integrity_floor_cross_flag: number;
  conditional_grant_flag: number;
  corsia_phase2_eligible_flag: number;
  sylvera_grade_equivalent: string | null;
  premium_pricing_uplift_pct: number;
  predicted_assessment_days: number;
  screened_flag: number;
  eligibility_check_ok_flag: number;
  assessment_complete_flag: number;
  vvb_review_complete_flag: number;
  decision_made_flag: number;
  request_ref: string | null;
  screening_ref: string | null;
  eligibility_check_ref: string | null;
  assessment_ref: string | null;
  vvb_review_ref: string | null;
  decision_ref: string | null;
  grant_ref: string | null;
  denial_ref: string | null;
  hold_ref: string | null;
  return_ref: string | null;
  dispute_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  corsia_eligibility_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  eligibility_check_basis: string | null;
  assessment_basis: string | null;
  vvb_review_basis: string | null;
  decision_basis: string | null;
  grant_basis: string | null;
  denial_basis: string | null;
  hold_basis: string | null;
  return_basis: string | null;
  dispute_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  conditional_grant_conditions: string | null;
  assessment_summary: string | null;
  chain_status: ChainStatus;
  requested_at: string;
  screening_at: string | null;
  eligibility_check_at: string | null;
  assessment_in_progress_at: string | null;
  vvb_review_at: string | null;
  ccp_decision_pending_at: string | null;
  ccp_label_granted_at: string | null;
  on_hold_at: string | null;
  returned_at: string | null;
  disputed_at: string | null;
  ccp_label_denied_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  high_integrity_risk_sector_flag?: boolean;
  ccp_aggregate_score_live?: number;
  weakest_criterion_live?: string | null;
  weakest_score_live?: number | null;
  gap_count_live?: number;
  integrity_floor_cross_flag_live?: boolean;
  label_class_live?: LabelClass | null;
  conditional_grant_flag_live?: boolean;
  corsia_phase2_eligible_flag_live?: boolean;
  sylvera_grade_equivalent_live?: string | null;
  premium_pricing_uplift_pct_live?: number;
  predicted_assessment_days_live?: number;
}

interface AssessmentEvent {
  id: string;
  assessment_id: string;
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
  open_count: number;
  granted_count: number;
  denied_count: number;
  on_hold_count: number;
  returned_count: number;
  disputed_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  conditional_count: number;
  corsia_eligible_count: number;
  integrity_floor_cross_count: number;
  high_integrity_risk_count: number;
  total_assessed_tco2e: number;
  granted_assessed_tco2e: number;
  avg_aggregate_score: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'requested',
  'screening',
  'eligibility_check',
  'assessment_in_progress',
  'vvb_review',
  'ccp_decision_pending',
  'ccp_label_granted',
];

const BRANCH_STATES: readonly string[] = [
  'on_hold',
  'returned',
  'disputed',
  'ccp_label_denied',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                  label: 'Active' },
  { key: 'all',                     label: 'All' },
  { key: 'minor',                   label: 'Minor' },
  { key: 'moderate',                label: 'Moderate' },
  { key: 'major',                   label: 'Major' },
  { key: 'mega',                    label: 'Mega' },
  { key: 'high_integrity_risk',     label: 'High-integrity-risk' },
  { key: 'conditional',             label: 'Conditional' },
  { key: 'corsia_eligible',         label: 'CORSIA Phase-2' },
  { key: 'integrity_floor_cross',   label: 'Integrity floor cross' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'requested',               label: 'Requested' },
  { key: 'screening',               label: 'Screening' },
  { key: 'eligibility_check',       label: 'Eligibility' },
  { key: 'assessment_in_progress',  label: 'Assessment' },
  { key: 'vvb_review',              label: 'VVB review' },
  { key: 'ccp_decision_pending',    label: 'Decision pending' },
  { key: 'ccp_label_granted',       label: 'Granted' },
  { key: 'on_hold',                 label: 'On hold' },
  { key: 'returned',                label: 'Returned' },
  { key: 'disputed',                label: 'Disputed' },
  { key: 'ccp_label_denied',        label: 'Denied' },
  { key: 'withdrawn',               label: 'Withdrawn' },
];

// ── state sets for secondary action eligibility ───────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['ccp_label_granted', 'ccp_label_denied', 'withdrawn'];
const HOLDABLE_STATES: ChainStatus[] = ['screening', 'eligibility_check', 'assessment_in_progress', 'vvb_review', 'ccp_decision_pending'];
const RETURNABLE_STATES: ChainStatus[] = ['eligibility_check', 'assessment_in_progress'];
const DISPUTABLE_STATES: ChainStatus[] = ['eligibility_check', 'assessment_in_progress', 'vvb_review', 'ccp_decision_pending'];
const DENIABLE_STATES: ChainStatus[] = ['ccp_decision_pending'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['requested', 'screening', 'eligibility_check', 'returned', 'on_hold'];

const CRITERION_LABEL: Record<string, string> = {
  effective_governance:    'Effective governance',
  tracking_system:         'Tracking system',
  transparency:            'Transparency',
  robust_quantification:   'Robust quantification',
  no_double_counting:      'No double counting',
  permanence:              'Permanence',
  additionality:           'Additionality',
  sustainable_development: 'Sustainable development',
  transition_to_net_zero:  'Transition to net-zero',
  safeguards:              'Safeguards',
};

const SECTOR_LABEL: Record<Sector, string> = {
  redd_plus:            'REDD+ (HIR floor)',
  jurisdictional:       'Jurisdictional (HIR floor)',
  avoidance:            'Avoidance (HIR floor)',
  arr:                  'ARR (reforestation)',
  improved_forest_mgmt: 'Improved forest mgmt',
  cookstove:            'Cookstove',
  renewable_energy:     'Renewable energy',
  methane:              'Methane',
  industrial_gas:       'Industrial gas',
  engineered_removal:   'Engineered removal',
  soil_carbon:          'Soil carbon',
  blue_carbon:          'Blue carbon',
};

// ── format helpers ────────────────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTco2e(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e/yr`;
}

function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1);
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: AssessmentRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary forward action per state
  if (row.chain_status === 'requested') {
    actions.push({
      key: 'begin-screening',
      label: 'Begin screening (ICVCM)',
      fields: [
        { key: 'screening_basis', label: 'Screening basis — ICVCM completeness assessment of the assessment request', type: 'textarea', required: true },
        { key: 'screening_ref',   label: 'Screening reference (e.g. SCR-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'screening') {
    actions.push({
      key: 'begin-eligibility-check',
      label: 'Begin eligibility check (assessor)',
      fields: [
        { key: 'eligibility_check_basis', label: 'Eligibility-check basis — the methodology eligibility gate (Verra/GS/Article 6.4)', type: 'textarea', required: true },
        { key: 'eligibility_check_ref',   label: 'Eligibility-check reference (e.g. ELIG-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'eligibility_check') {
    actions.push({
      key: 'begin-assessment',
      label: 'Begin 10-criterion assessment (assessor)',
      fields: [
        { key: 'assessment_basis',              label: 'Assessment basis — the 10-criterion CCP scoring (0-100 per criterion)', type: 'textarea', required: true },
        { key: 'assessment_ref',                label: 'Assessment reference (e.g. ASS-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
        { key: 'effective_governance_score',    label: 'Effective governance score (0-100)', type: 'number', required: false, placeholder: String(row.effective_governance_score ?? '') },
        { key: 'tracking_system_score',         label: 'Tracking system score (0-100)', type: 'number', required: false, placeholder: String(row.tracking_system_score ?? '') },
        { key: 'transparency_score',            label: 'Transparency score (0-100)', type: 'number', required: false, placeholder: String(row.transparency_score ?? '') },
        { key: 'robust_quantification_score',   label: 'Robust quantification score (0-100)', type: 'number', required: false, placeholder: String(row.robust_quantification_score ?? '') },
        { key: 'no_double_counting_score',      label: 'No double counting score (0-100)', type: 'number', required: false, placeholder: String(row.no_double_counting_score ?? '') },
        { key: 'permanence_score',              label: 'Permanence score (0-100)', type: 'number', required: false, placeholder: String(row.permanence_score ?? '') },
        { key: 'additionality_score',           label: 'Additionality score (0-100)', type: 'number', required: false, placeholder: String(row.additionality_score ?? '') },
        { key: 'sustainable_development_score', label: 'Sustainable development score (0-100)', type: 'number', required: false, placeholder: String(row.sustainable_development_score ?? '') },
        { key: 'transition_to_net_zero_score',  label: 'Transition to net-zero score (0-100)', type: 'number', required: false, placeholder: String(row.transition_to_net_zero_score ?? '') },
        { key: 'safeguards_score',              label: 'Safeguards score (0-100)', type: 'number', required: false, placeholder: String(row.safeguards_score ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'assessment_in_progress') {
    actions.push({
      key: 'complete-vvb-review',
      label: 'Complete VVB review (VVB)',
      fields: [
        { key: 'vvb_review_basis', label: 'VVB review basis — independent third-party verification of the assessment scoring', type: 'textarea', required: true },
        { key: 'vvb_review_ref',   label: 'VVB review reference (e.g. VVB-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'vvb_review') {
    actions.push({
      key: 'submit-for-decision',
      label: 'Submit for ICVCM decision',
      fields: [
        { key: 'decision_basis', label: 'Decision basis — submitted to ICVCM for label decision', type: 'textarea', required: true },
        { key: 'decision_ref',   label: 'Decision reference (e.g. DEC-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'ccp_decision_pending') {
    // Primary: grant
    actions.push({
      key: 'grant-ccp-label',
      label: 'Grant CCP label (ICVCM)',
      fields: [
        { key: 'grant_basis',                  label: 'Grant basis — ICVCM grants the CCP label (full or conditional from scoring)', type: 'textarea', required: true },
        { key: 'grant_ref',                    label: 'Grant reference (e.g. GRT-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
        { key: 'conditional_grant_conditions', label: 'Conditional grant conditions (leave blank for FULL eligible; populate for CONDITIONAL)', type: 'textarea', required: false, placeholder: '' },
        { key: 'corsia_eligibility_ref',       label: 'CORSIA eligibility reference (only if CCP-eligible — unlocks Phase-2 aviation retirements)', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref',                label: 'Regulator reference (hard line — conditional or major/mega cross to regulator)', type: 'text', required: false, placeholder: '' },
      ],
      // grant_ccp_label crosses regulator EVERY tier when CONDITIONAL, else for major+mega
      cascadeTo: ['regulator'],
    });
    // Secondary: deny (W91 signature — crosses regulator EVERY tier)
    actions.push({
      key: 'deny-ccp-label',
      label: 'Deny CCP label (ICVCM)',
      fields: [
        { key: 'denial_basis', label: 'Denial basis — ICVCM denies the CCP label (signature: crosses regulator EVERY tier)', type: 'textarea', required: true },
        { key: 'reason_code',  label: 'Reason code (e.g. integrity_floor_failed / weakest_criterion_fail / additionality_fail)', type: 'text', required: false, placeholder: 'integrity_floor_failed' },
        { key: 'denial_ref',   label: 'Denial reference (e.g. DEN-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (hard line — denial always reportable)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (row.chain_status === 'on_hold') {
    actions.push({
      key: 'resume',
      label: 'Resume (proponent)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'returned') {
    actions.push({
      key: 'resubmit',
      label: 'Resubmit (proponent)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute (ICVCM)',
      fields: [],
      cascadeTo: [],
    });
  }

  // Secondary actions available across multiple states
  if (HOLDABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'place-on-hold',
      label: 'Place on hold (ICVCM)',
      fields: [
        { key: 'hold_basis',   label: 'Hold basis — pause assessment pending information', type: 'textarea', required: true },
        { key: 'reason_code',  label: 'Reason code (e.g. integrity_flag / vvb_query / proponent_response_pending)', type: 'text', required: false, placeholder: 'integrity_flag' },
        { key: 'hold_ref',     label: 'Hold reference (e.g. HLD-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (RETURNABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'return-for-remediation',
      label: 'Return for remediation (assessor)',
      fields: [
        { key: 'return_basis', label: 'Return basis — bounce back to proponent for gap remediation', type: 'textarea', required: true },
        { key: 'reason_code',  label: 'Reason code (e.g. scoring_gap / weakest_criterion_below_threshold / methodology_gap)', type: 'text', required: false, placeholder: 'scoring_gap' },
        { key: 'return_ref',   label: 'Return reference (e.g. RET-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (DISPUTABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute (proponent)',
      fields: [
        { key: 'dispute_basis', label: 'Dispute basis — proponent appeals the assessment (major+mega cross regulator)', type: 'textarea', required: true },
        { key: 'reason_code',   label: 'Reason code (e.g. scoring_dispute / process_complaint / methodology_dispute)', type: 'text', required: false, placeholder: 'scoring_dispute' },
        { key: 'dispute_ref',   label: 'Dispute reference (e.g. DSP-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (major / mega only)', type: 'text', required: false, placeholder: '' },
      ],
      // raise_dispute crosses regulator for major+mega tiers
      cascadeTo: ['regulator'],
    });
  }

  if (WITHDRAWABLE_STATES.includes(row.chain_status)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (proponent)',
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis — proponent withdraws the assessment request', type: 'textarea', required: true },
        { key: 'reason_code',      label: 'Reason code (e.g. proponent_withdrawn / commercial / methodology_change)', type: 'text', required: false, placeholder: 'proponent_withdrawn' },
        { key: 'withdrawal_ref',   label: 'Withdrawal reference (e.g. WDR-CCP-2026-0007)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: AssessmentRow): React.ReactNode {
  const labelLive = row.label_class_live ?? row.label_class;
  const conditional = row.conditional_grant_flag_live ?? !!row.conditional_grant_flag;
  const hir = row.high_integrity_risk_sector_flag ?? !!row.high_integrity_risk_flag;
  const floorCross = row.integrity_floor_cross_flag_live ?? !!row.integrity_floor_cross_flag;
  const corsia = row.corsia_phase2_eligible_flag_live ?? !!row.corsia_phase2_eligible_flag;
  const aggregate = row.ccp_aggregate_score_live ?? row.ccp_aggregate_score;
  const grade = row.sylvera_grade_equivalent_live ?? row.sylvera_grade_equivalent;
  const premium = row.premium_pricing_uplift_pct_live ?? row.premium_pricing_uplift_pct;
  const predicted = row.predicted_assessment_days_live ?? row.predicted_assessment_days;
  const weakestCrit = row.weakest_criterion_live ?? row.weakest_criterion;
  const weakestScore = row.weakest_score_live ?? row.weakest_score;
  const gapCountLive = row.gap_count_live ?? row.gap_count;
  const reportable = row.is_reportable_flag ?? !!row.is_reportable;

  const criteria: Array<{ key: string; score: number | null }> = [
    { key: 'effective_governance',    score: row.effective_governance_score },
    { key: 'tracking_system',         score: row.tracking_system_score },
    { key: 'transparency',            score: row.transparency_score },
    { key: 'robust_quantification',   score: row.robust_quantification_score },
    { key: 'no_double_counting',      score: row.no_double_counting_score },
    { key: 'permanence',              score: row.permanence_score },
    { key: 'additionality',           score: row.additionality_score },
    { key: 'sustainable_development', score: row.sustainable_development_score },
    { key: 'transition_to_net_zero',  score: row.transition_to_net_zero_score },
    { key: 'safeguards',              score: row.safeguards_score },
  ];

  return (
    <div style={{ color: TX1, fontSize: 11 }}>
      {/* CCP integrity battery */}
      <div className="mb-2">
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>CCP integrity battery (live)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Aggregate score"         value={fmtScore(aggregate)} />
          <DetailPair label="Sylvera-equivalent grade" value={grade ?? '—'} />
          <DetailPair label="Label class (live)"       value={labelLive ? labelLive.replace(/_/g, ' ') : '—'} />
          <DetailPair label="Conditional grant"        value={conditional ? 'YES' : 'No'} />
          <DetailPair label="Weakest criterion"        value={weakestCrit ? `${CRITERION_LABEL[weakestCrit] ?? weakestCrit} (${fmtScore(weakestScore)})` : '—'} />
          <DetailPair label="Gap count (<70)"          value={String(gapCountLive ?? 0)} />
          <DetailPair label="Integrity floor cross (<50)" value={floorCross ? 'YES — at least one criterion below 50' : 'No'} />
          <DetailPair label="CORSIA Phase-2 eligible"  value={corsia ? 'YES — unlocks aviation retirements' : 'No'} />
          <DetailPair label="Premium pricing uplift"   value={fmtPct(premium)} />
          <DetailPair label="Predicted assessment"     value={predicted ? `${predicted}d` : '—'} />
          <DetailPair label="High-integrity-risk sector" value={hir ? 'YES — floors at major' : 'No'} />
          <DetailPair label="Reportable"               value={reportable ? 'Yes' : 'No'} />
        </div>
      </div>

      {/* 10-criterion scorecard */}
      <div className="mb-2">
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>10-criterion scorecard</div>
        <div className="grid grid-cols-2 gap-1.5">
          {criteria.map((c) => {
            const s = c.score;
            const scoreColor = s == null
              ? TX3
              : s < 50 ? BAD
              : s < 70 ? WARN
              : s < 80 ? TX1
              : GOOD;
            return (
              <div key={c.key} className="flex items-center justify-between rounded border px-2 py-1" style={{ borderColor: BORDER, background: BG2 }}>
                <span style={{ color: TX1 }}>{CRITERION_LABEL[c.key]}</span>
                <span className="tabular-nums font-semibold" style={{ color: scoreColor, fontFamily: MONO }}>{fmtScore(s)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key fields */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
        <DetailPair label="Registry standard"  value={row.registry_standard ?? '—'} />
        <DetailPair label="Sector"             value={SECTOR_LABEL[row.sector]} />
        <DetailPair label="Methodology"        value={`${row.methodology_id ?? '—'}${row.methodology_version ? ' · v' + row.methodology_version : ''}`} />
        <DetailPair label="Host country"       value={row.host_country ?? '—'} />
        <DetailPair label="Assessed annual"    value={fmtTco2e(row.assessed_annual_tco2e)} />
        <DetailPair label="Proponent"          value={row.proponent_party_name ?? '—'} />
        <DetailPair label="VVB"                value={row.vvb_name ?? '—'} />
        <DetailPair label="Quality assessor"   value={row.quality_assessor_name ?? '—'} />
        <DetailPair label="Screening ref"      value={row.screening_ref ?? '—'} />
        <DetailPair label="Eligibility ref"    value={row.eligibility_check_ref ?? '—'} />
        <DetailPair label="Assessment ref"     value={row.assessment_ref ?? '—'} />
        <DetailPair label="VVB review ref"     value={row.vvb_review_ref ?? '—'} />
        <DetailPair label="Decision ref"       value={row.decision_ref ?? '—'} />
        <DetailPair label="Grant ref"          value={row.grant_ref ?? '—'} />
        <DetailPair label="Denial ref"         value={row.denial_ref ?? '—'} />
        <DetailPair label="CORSIA elig. ref"   value={row.corsia_eligibility_ref ?? '—'} />
        <DetailPair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
        <DetailPair label="Reason code"        value={row.reason_code ?? '—'} />
        <DetailPair label="Requested"          value={fmtDate(row.requested_at)} />
        <DetailPair label="Screening"          value={fmtDate(row.screening_at)} />
        <DetailPair label="Eligibility check"  value={fmtDate(row.eligibility_check_at)} />
        <DetailPair label="Assessment"         value={fmtDate(row.assessment_in_progress_at)} />
        <DetailPair label="VVB review"         value={fmtDate(row.vvb_review_at)} />
        <DetailPair label="Decision pending"   value={fmtDate(row.ccp_decision_pending_at)} />
        <DetailPair label="Label granted"      value={fmtDate(row.ccp_label_granted_at)} />
        <DetailPair label="Label denied"       value={fmtDate(row.ccp_label_denied_at)} />
        <DetailPair label="On hold"            value={fmtDate(row.on_hold_at)} />
        <DetailPair label="Returned"           value={fmtDate(row.returned_at)} />
        <DetailPair label="Disputed"           value={fmtDate(row.disputed_at)} />
        <DetailPair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"         value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"     value={String(row.escalation_level)} />
        {row.source_wave && <DetailPair label="Source wave"    value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />}
      </div>

      {/* Basis text blocks */}
      {row.conditional_grant_conditions && (
        <BasisBlock label="Conditional grant conditions" tone={WARN} text={row.conditional_grant_conditions} />
      )}
      {row.assessment_summary && (
        <BasisBlock label="Assessment summary" tone={TX2} text={row.assessment_summary} />
      )}
      {row.request_basis && (
        <BasisBlock label="Request basis" tone={TX2} text={row.request_basis} />
      )}
      {row.screening_basis && (
        <BasisBlock label="Screening basis (ICVCM)" tone={TX2} text={row.screening_basis} />
      )}
      {row.eligibility_check_basis && (
        <BasisBlock label="Eligibility check basis (assessor)" tone={TX2} text={row.eligibility_check_basis} />
      )}
      {row.assessment_basis && (
        <BasisBlock label="Assessment basis (assessor)" tone={WARN} text={row.assessment_basis} />
      )}
      {row.vvb_review_basis && (
        <BasisBlock label="VVB review basis" tone={GOOD} text={row.vvb_review_basis} />
      )}
      {row.decision_basis && (
        <BasisBlock label="Decision basis" tone={WARN} text={row.decision_basis} />
      )}
      {row.grant_basis && (
        <BasisBlock label="Grant basis (ICVCM)" tone={GOOD} text={row.grant_basis} />
      )}
      {row.denial_basis && (
        <BasisBlock label="Denial basis (ICVCM)" tone={BAD} text={row.denial_basis} />
      )}
      {row.hold_basis && (
        <BasisBlock label="Hold basis" tone={WARN} text={row.hold_basis} />
      )}
      {row.return_basis && (
        <BasisBlock label="Return basis" tone={WARN} text={row.return_basis} />
      )}
      {row.dispute_basis && (
        <BasisBlock label="Dispute basis" tone={BAD} text={row.dispute_basis} />
      )}
      {row.withdrawal_basis && (
        <BasisBlock label="Withdrawal basis" tone={BAD} text={row.withdrawal_basis} />
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CcpAssessmentChainTab() {
  const [rows, setRows] = useState<AssessmentRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AssessmentRow[] } & KpiSummary }>('/ccp-assessment/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, granted_count: d.granted_count,
          denied_count: d.denied_count, on_hold_count: d.on_hold_count,
          returned_count: d.returned_count, disputed_count: d.disputed_count,
          withdrawn_count: d.withdrawn_count, breached: d.breached,
          reportable_total: d.reportable_total, conditional_count: d.conditional_count,
          corsia_eligible_count: d.corsia_eligible_count,
          integrity_floor_cross_count: d.integrity_floor_cross_count,
          high_integrity_risk_count: d.high_integrity_risk_count,
          total_assessed_tco2e: d.total_assessed_tco2e,
          granted_assessed_tco2e: d.granted_assessed_tco2e,
          avg_aggregate_score: d.avg_aggregate_score,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load CCP assessments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ccp-assessment/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { case: AssessmentRow; events: ChainEvent[] } }>(`/ccp-assessment/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: AssessmentRow; events: ChainEvent[] } }>(`/ccp-assessment/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                    return true;
      if (filter === 'active')                 return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')               return r.sla_breached ?? false;
      if (filter === 'reportable')             return r.is_reportable_flag ?? !!r.is_reportable;
      if (filter === 'high_integrity_risk')    return r.high_integrity_risk_sector_flag ?? !!r.high_integrity_risk_flag;
      if (filter === 'conditional')            return r.conditional_grant_flag_live ?? !!r.conditional_grant_flag;
      if (filter === 'corsia_eligible')        return r.corsia_phase2_eligible_flag_live ?? !!r.corsia_phase2_eligible_flag;
      if (filter === 'integrity_floor_cross')  return r.integrity_floor_cross_flag_live ?? !!r.integrity_floor_cross_flag;
      if (filter === 'minor' || filter === 'moderate' || filter === 'major' || filter === 'mega') {
        return r.assessment_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>ICVCM CCP-eligibility assessment &amp; label lifecycle</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state quality-label chain · requested → screening → eligibility check → assessment →
          VVB review → decision pending → CCP label GRANTED (clean), with on_hold / returned /
          disputed loops, and terminal DENIED / withdrawn. INVERTED SLA: larger assessed volume =
          longer window. Signature: deny_ccp_label crosses regulator EVERY tier; grant crosses
          EVERY tier when CONDITIONAL, else major+mega; raise_dispute and SLA breach cross
          major+mega. Beats Sylvera / BeZero / Calyx Global / Renoster / Pachama via live
          10-criterion aggregate, weakest-criterion ID, integrity-floor cross, CORSIA Phase-2
          eligibility, Sylvera-equivalent grade (AAA-F), premium-pricing uplift % and predicted
          assessment days.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <KpiTile label="Total"               value={kpis?.total ?? rows.length} />
        <KpiTile label="Open"                value={kpis?.open_count ?? 0} />
        <KpiTile label="Granted"             value={kpis?.granted_count ?? 0} tone="ok" />
        <KpiTile label="Denied"              value={kpis?.denied_count ?? 0} tone={(kpis?.denied_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="On hold"             value={kpis?.on_hold_count ?? 0} tone={(kpis?.on_hold_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Returned"            value={kpis?.returned_count ?? 0} tone={(kpis?.returned_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Disputed"            value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Withdrawn"           value={kpis?.withdrawn_count ?? 0} />
        <KpiTile label="SLA breached"        value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Conditional"         value={kpis?.conditional_count ?? 0} tone={(kpis?.conditional_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="CORSIA Phase-2"      value={kpis?.corsia_eligible_count ?? 0} tone="ok" />
        <KpiTile label="Integrity floor"     value={kpis?.integrity_floor_cross_count ?? 0} tone={(kpis?.integrity_floor_cross_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="High-integrity-risk" value={kpis?.high_integrity_risk_count ?? 0} tone={(kpis?.high_integrity_risk_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable"          value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Assessed annual"     value={fmtTco2e(kpis?.total_assessed_tco2e ?? 0)} />
        <KpiTile label="Granted annual"      value={fmtTco2e(kpis?.granted_assessed_tco2e ?? 0)} tone="ok" />
        <KpiTile label="Avg aggregate"       value={fmtScore(kpis?.avg_aggregate_score)} />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const aggregate = row.ccp_aggregate_score_live ?? row.ccp_aggregate_score ?? 0;
            const grade = row.sylvera_grade_equivalent_live ?? row.sylvera_grade_equivalent;
            const labelLive = row.label_class_live ?? row.label_class;
            const reportable = row.is_reportable_flag ?? !!row.is_reportable;
            const floorCross = row.integrity_floor_cross_flag_live ?? !!row.integrity_floor_cross_flag;
            const hir = row.high_integrity_risk_sector_flag ?? !!row.high_integrity_risk_flag;

            const metaParts = [
              SECTOR_LABEL[row.sector],
              row.registry_standard ?? null,
              grade ? `Grade: ${grade}` : null,
              aggregate > 0 ? `Score: ${aggregate.toFixed(1)}` : null,
              labelLive ? labelLive.replace(/_/g, ' ') : null,
              reportable ? 'reportable' : null,
              floorCross ? 'floor cross' : null,
              hir ? 'HIR sector' : null,
            ].filter(Boolean).join(' · ');

            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.assessment_number}${row.project_name ? ' — ' + row.project_name : ''}`}
                meta={metaParts}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No assessments match.
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
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap text-[11px]" style={{ color: tone }}>{text}</div>
    </div>
  );
}

export default CcpAssessmentChainTab;
