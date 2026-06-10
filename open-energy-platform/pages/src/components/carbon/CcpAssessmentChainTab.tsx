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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  requested:              { bg: '#e3e7ec', fg: '#557',    label: 'Requested' },
  screening:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Screening' },
  eligibility_check:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Eligibility check' },
  assessment_in_progress: { bg: '#fff4d6', fg: '#a06200', label: 'Assessment' },
  vvb_review:             { bg: '#fff4d6', fg: '#a06200', label: 'VVB review' },
  ccp_decision_pending:   { bg: '#fff4d6', fg: '#a06200', label: 'Decision pending' },
  ccp_label_granted:      { bg: '#d4edda', fg: '#155724', label: 'CCP label GRANTED' },
  on_hold:                { bg: '#ffe4b5', fg: '#8a4a00', label: 'On hold' },
  returned:               { bg: '#ffe4b5', fg: '#8a4a00', label: 'Returned' },
  disputed:               { bg: '#fbd3d3', fg: '#7a1414', label: 'Disputed' },
  ccp_label_denied:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'CCP label DENIED' },
  withdrawn:              { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<100k/yr)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<500k/yr)' },
  major:    { bg: '#fff4d6', fg: '#a06200', label: 'Major (<2M/yr)' },
  mega:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Mega (≥2M/yr)' },
};

const LABEL_CLASS_TONE: Record<LabelClass, { bg: string; fg: string; label: string }> = {
  ccp_eligible:     { bg: '#d4edda', fg: '#155724', label: 'CCP-eligible' },
  ccp_conditional:  { bg: '#fff4d6', fg: '#a06200', label: 'CCP-conditional' },
  ccp_not_eligible: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Not eligible' },
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

type ActionKind =
  | 'begin-screening' | 'begin-eligibility-check' | 'begin-assessment'
  | 'complete-vvb-review' | 'submit-for-decision' | 'grant-ccp-label'
  | 'deny-ccp-label' | 'place-on-hold' | 'resume' | 'return-for-remediation'
  | 'resubmit' | 'raise-dispute' | 'resolve-dispute' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  requested:              'begin-screening',
  screening:              'begin-eligibility-check',
  eligibility_check:      'begin-assessment',
  assessment_in_progress: 'complete-vvb-review',
  vvb_review:             'submit-for-decision',
  ccp_decision_pending:   'grant-ccp-label',
  ccp_label_granted:      null,
  on_hold:                'resume',
  returned:               'resubmit',
  disputed:               'resolve-dispute',
  ccp_label_denied:       null,
  withdrawn:              null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-screening':         'Begin screening (ICVCM)',
  'begin-eligibility-check': 'Begin eligibility check (assessor)',
  'begin-assessment':        'Begin 10-criterion assessment (assessor)',
  'complete-vvb-review':     'Complete VVB review (VVB)',
  'submit-for-decision':     'Submit for ICVCM decision',
  'grant-ccp-label':         'Grant CCP label (ICVCM)',
  'deny-ccp-label':          'Deny CCP label (ICVCM)',
  'place-on-hold':           'Place on hold (ICVCM)',
  'resume':                  'Resume (proponent)',
  'return-for-remediation':  'Return for remediation (assessor)',
  'resubmit':                'Resubmit (proponent)',
  'raise-dispute':           'Raise dispute (proponent)',
  'resolve-dispute':         'Resolve dispute (ICVCM)',
  'withdraw':                'Withdraw (proponent)',
};

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

export function CcpAssessmentChainTab() {
  const [rows, setRows] = useState<AssessmentRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<AssessmentRow | null>(null);
  const [events, setEvents] = useState<AssessmentEvent[]>([]);

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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: AssessmentRow; events: AssessmentEvent[] } }>(
        `/ccp-assessment/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load assessment history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                  return true;
      if (filter === 'active')               return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')             return r.sla_breached;
      if (filter === 'reportable')           return r.is_reportable_flag ?? !!r.is_reportable;
      if (filter === 'high_integrity_risk')  return r.high_integrity_risk_sector_flag ?? !!r.high_integrity_risk_flag;
      if (filter === 'conditional')          return r.conditional_grant_flag_live ?? !!r.conditional_grant_flag;
      if (filter === 'corsia_eligible')      return r.corsia_phase2_eligible_flag_live ?? !!r.corsia_phase2_eligible_flag;
      if (filter === 'integrity_floor_cross') return r.integrity_floor_cross_flag_live ?? !!r.integrity_floor_cross_flag;
      if (filter === 'minor' || filter === 'moderate' || filter === 'major' || filter === 'mega') {
        return r.assessment_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: AssessmentRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'begin-screening') {
        const basis = window.prompt('Screening basis — ICVCM completeness assessment of the assessment request:');
        if (!basis) return;
        const ref = window.prompt('Screening reference (e.g. SCR-CCP-2026-0007):') || '';
        body = { screening_basis: basis };
        if (ref) body.screening_ref = ref;
      } else if (action === 'begin-eligibility-check') {
        const basis = window.prompt('Eligibility-check basis — the methodology eligibility gate (Verra/GS/Article 6.4):');
        if (!basis) return;
        const ref = window.prompt('Eligibility-check reference (e.g. ELIG-CCP-2026-0007):') || '';
        body = { eligibility_check_basis: basis };
        if (ref) body.eligibility_check_ref = ref;
      } else if (action === 'begin-assessment') {
        const basis = window.prompt('Assessment basis — the 10-criterion CCP scoring (0-100 per criterion):');
        if (!basis) return;
        const ref = window.prompt('Assessment reference (e.g. ASS-CCP-2026-0007):') || '';
        const promptScore = (label: string, prev: number | null) => {
          const v = window.prompt(`${label} score 0-100:`, prev != null ? String(prev) : '');
          return v && !Number.isNaN(Number(v)) ? Number(v) : null;
        };
        const eg = promptScore('Effective governance', row.effective_governance_score);
        const ts = promptScore('Tracking system', row.tracking_system_score);
        const tr = promptScore('Transparency', row.transparency_score);
        const rq = promptScore('Robust quantification', row.robust_quantification_score);
        const nd = promptScore('No double counting', row.no_double_counting_score);
        const pm = promptScore('Permanence', row.permanence_score);
        const ad = promptScore('Additionality', row.additionality_score);
        const sd = promptScore('Sustainable development', row.sustainable_development_score);
        const tn = promptScore('Transition to net-zero', row.transition_to_net_zero_score);
        const sf = promptScore('Safeguards', row.safeguards_score);
        body = { assessment_basis: basis };
        if (ref) body.assessment_ref = ref;
        if (eg != null) body.effective_governance_score = eg;
        if (ts != null) body.tracking_system_score = ts;
        if (tr != null) body.transparency_score = tr;
        if (rq != null) body.robust_quantification_score = rq;
        if (nd != null) body.no_double_counting_score = nd;
        if (pm != null) body.permanence_score = pm;
        if (ad != null) body.additionality_score = ad;
        if (sd != null) body.sustainable_development_score = sd;
        if (tn != null) body.transition_to_net_zero_score = tn;
        if (sf != null) body.safeguards_score = sf;
      } else if (action === 'complete-vvb-review') {
        const basis = window.prompt('VVB review basis — independent third-party verification of the assessment scoring:');
        if (!basis) return;
        const ref = window.prompt('VVB review reference (e.g. VVB-CCP-2026-0007):') || '';
        body = { vvb_review_basis: basis };
        if (ref) body.vvb_review_ref = ref;
      } else if (action === 'submit-for-decision') {
        const basis = window.prompt('Decision basis — submitted to ICVCM for label decision:');
        if (!basis) return;
        const ref = window.prompt('Decision reference (e.g. DEC-CCP-2026-0007):') || '';
        body = { decision_basis: basis };
        if (ref) body.decision_ref = ref;
      } else if (action === 'grant-ccp-label') {
        const basis = window.prompt('Grant basis — ICVCM grants the CCP label (full or conditional from scoring):');
        if (!basis) return;
        const ref = window.prompt('Grant reference (e.g. GRT-CCP-2026-0007):') || '';
        const conditions = window.prompt('Conditional grant conditions (leave blank for FULL eligible; populate for CONDITIONAL):', '') || '';
        const corsiaRef = window.prompt('CORSIA eligibility reference (only if CCP-eligible — unlocks Phase-2 aviation retirements):', '') || '';
        const regRef = window.prompt('Regulator reference (W91 hard line — conditional or major/mega cross to regulator):', '') || '';
        body = { grant_basis: basis };
        if (ref) body.grant_ref = ref;
        if (conditions) body.conditional_grant_conditions = conditions;
        if (corsiaRef) body.corsia_eligibility_ref = corsiaRef;
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'deny-ccp-label') {
        const basis = window.prompt('Denial basis — ICVCM denies the CCP label (W91 signature: crosses regulator EVERY tier):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. integrity_floor_failed / weakest_criterion_fail / additionality_fail):', 'integrity_floor_failed') || '';
        const ref = window.prompt('Denial reference (e.g. DEN-CCP-2026-0007):') || '';
        const regRef = window.prompt('Regulator reference (W91 hard line — denial always reportable):', '') || '';
        body = { denial_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.denial_ref = ref;
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'place-on-hold') {
        const basis = window.prompt('Hold basis — pause assessment pending information:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. integrity_flag / vvb_query / proponent_response_pending):', 'integrity_flag') || '';
        const ref = window.prompt('Hold reference (e.g. HLD-CCP-2026-0007):') || '';
        body = { hold_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.hold_ref = ref;
      } else if (action === 'resume') {
        // No payload — proponent resumes the chain and re-enters screening.
      } else if (action === 'return-for-remediation') {
        const basis = window.prompt('Return basis — bounce back to proponent for gap remediation:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. scoring_gap / weakest_criterion_below_threshold / methodology_gap):', 'scoring_gap') || '';
        const ref = window.prompt('Return reference (e.g. RET-CCP-2026-0007):') || '';
        body = { return_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.return_ref = ref;
      } else if (action === 'resubmit') {
        // No payload — proponent resubmits after remediation.
      } else if (action === 'raise-dispute') {
        const basis = window.prompt('Dispute basis — proponent appeals the assessment (major+mega cross regulator):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. scoring_dispute / process_complaint / methodology_dispute):', 'scoring_dispute') || '';
        const ref = window.prompt('Dispute reference (e.g. DSP-CCP-2026-0007):') || '';
        const regRef = window.prompt('Regulator reference (major / mega only):', '') || '';
        body = { dispute_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.dispute_ref = ref;
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'resolve-dispute') {
        // No payload — the dispute is resolved and chain lands back at vvb_review.
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal basis — proponent withdraws the assessment request:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. proponent_withdrawn / commercial / methodology_change):', 'proponent_withdrawn') || '';
        const ref = window.prompt('Withdrawal reference (e.g. WDR-CCP-2026-0007):') || '';
        body = { withdrawal_basis: basis };
        if (reason) body.reason_code = reason;
        if (ref) body.withdrawal_ref = ref;
      }
      await api.post(`/ccp-assessment/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">ICVCM CCP-eligibility assessment &amp; label lifecycle</h2>
          <p className="text-xs text-[#4a5568]">
            12-state quality-label chain · requested → screening → eligibility check → assessment →
            VVB review → decision pending → CCP label GRANTED (clean), with on_hold / returned /
            disputed loops, and terminal DENIED / withdrawn. INVERTED SLA: the larger the assessed
            annual volume, the longer every window — deeper rating diligence. The W91 signature is
            INTEGRITY-MARK-driven — deny_ccp_label crosses the regulator inbox for EVERY tier (the
            public market-rejection signal); grant_ccp_label crosses EVERY tier when CONDITIONAL,
            else for major+mega; raise_dispute and SLA breach cross for major+mega. Beats Sylvera,
            BeZero Carbon, Calyx Global, Renoster and Pachama via LIVE calculated CCP-criteria
            scoring — 10-criterion aggregate, weakest-criterion identification, integrity-floor
            cross, CORSIA Phase-2 eligibility, Sylvera-equivalent grade (AAA-F), premium-pricing
            uplift % and predicted assessment days — all derived from the same inputs every
            transition.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Granted" value={kpis?.granted_count ?? 0} tone="ok" />
        <Kpi label="Denied" value={kpis?.denied_count ?? 0} tone={(kpis?.denied_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="On hold" value={kpis?.on_hold_count ?? 0} tone={(kpis?.on_hold_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Returned" value={kpis?.returned_count ?? 0} tone={(kpis?.returned_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Conditional" value={kpis?.conditional_count ?? 0} tone={(kpis?.conditional_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="CORSIA Phase-2" value={kpis?.corsia_eligible_count ?? 0} tone="ok" />
        <Kpi label="Integrity floor cross" value={kpis?.integrity_floor_cross_count ?? 0} tone={(kpis?.integrity_floor_cross_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="High-integrity-risk" value={kpis?.high_integrity_risk_count ?? 0} tone={(kpis?.high_integrity_risk_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Assessed annual" value={fmtTco2e(kpis?.total_assessed_tco2e ?? 0)} />
        <Kpi label="Granted annual" value={fmtTco2e(kpis?.granted_assessed_tco2e ?? 0)} tone="ok" />
        <Kpi label="Avg aggregate" value={fmtScore(kpis?.avg_aggregate_score)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Assessment #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Sector</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Aggregate</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Grade</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Label</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.assessment_tier];
                const reportable = r.is_reportable_flag ?? !!r.is_reportable;
                const labelLive = r.label_class_live ?? r.label_class;
                const conditional = r.conditional_grant_flag_live ?? !!r.conditional_grant_flag;
                const hir = r.high_integrity_risk_sector_flag ?? !!r.high_integrity_risk_flag;
                const floorCross = r.integrity_floor_cross_flag_live ?? !!r.integrity_floor_cross_flag;
                const aggregate = r.ccp_aggregate_score_live ?? r.ccp_aggregate_score ?? 0;
                const grade = r.sylvera_grade_equivalent_live ?? r.sylvera_grade_equivalent;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.assessment_number}
                      {reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {floorCross && <span className="ml-1 text-[#9b1f1f]" title="Crosses integrity floor (<50 on a criterion)">⚠</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[220px] truncate" title={r.project_name || ''}>
                      <div className="truncate">{r.project_name || '—'}</div>
                      <div className="text-[10px] text-[#4a5568] truncate">{r.registry_standard || '—'} · {r.host_country || ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      {SECTOR_LABEL[r.sector]}
                      {hir && <span className="ml-1 text-[#a06200]" title="High-integrity-risk sector (floors at major)">⚑</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {aggregate > 0 ? aggregate.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] font-semibold">
                      {grade || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {labelLive ? (
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: LABEL_CLASS_TONE[labelLive].bg, color: LABEL_CLASS_TONE[labelLive].fg }}>
                          {LABEL_CLASS_TONE[labelLive].label}
                          {conditional && <span className="ml-1" title="Conditional grant">†</span>}
                        </span>
                      ) : <span className="text-[#4a5568]">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No assessments match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: AssessmentRow;
  events: AssessmentEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: AssessmentRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canHold = HOLDABLE_STATES.includes(row.chain_status);
  const canReturn = RETURNABLE_STATES.includes(row.chain_status);
  const canDispute = DISPUTABLE_STATES.includes(row.chain_status);
  const canDeny = DENIABLE_STATES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);
  const reportable = row.is_reportable_flag ?? !!row.is_reportable;
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
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.assessment_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name || row.assessment_number}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.assessment_tier].label} · {row.registry_standard || '—'} · {SECTOR_LABEL[row.sector]}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">CCP integrity battery (live)</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Aggregate score" value={fmtScore(aggregate)} />
            <Pair label="Sylvera-equivalent grade" value={grade ?? '—'} />
            <Pair label="Label class (live)" value={labelLive ? LABEL_CLASS_TONE[labelLive].label : '—'} />
            <Pair label="Conditional grant" value={conditional ? 'YES' : 'No'} />
            <Pair label="Weakest criterion" value={weakestCrit ? `${CRITERION_LABEL[weakestCrit] ?? weakestCrit} (${fmtScore(weakestScore)})` : '—'} />
            <Pair label="Gap count (<70)" value={String(gapCountLive ?? 0)} />
            <Pair label="Integrity floor cross (<50)" value={floorCross ? 'YES — at least one criterion below 50' : 'No'} />
            <Pair label="CORSIA Phase-2 eligible" value={corsia ? 'YES — unlocks aviation retirements' : 'No'} />
            <Pair label="Premium pricing uplift" value={fmtPct(premium)} />
            <Pair label="Predicted assessment" value={predicted ? `${predicted}d` : '—'} />
            <Pair label="High-integrity-risk sector" value={hir ? 'YES — floors at major' : 'No'} />
            <Pair label="Reportable" value={reportable ? 'Yes' : 'No'} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">10-criterion scorecard</div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            {criteria.map((c) => {
              const s = c.score;
              const tone = s == null ? '#4a5568' : s < 50 ? '#9b1f1f' : s < 70 ? '#a06200' : s < 80 ? '#1a3a5c' : '#155724';
              return (
                <div key={c.key} className="flex items-center justify-between rounded border border-[#e3e7ec] px-2 py-1.5">
                  <span className="text-[#0c2a4d]">{CRITERION_LABEL[c.key]}</span>
                  <span className="tabular-nums font-semibold" style={{ color: tone }}>{fmtScore(s)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                 value={TIER_TONE[row.assessment_tier].label} />
            <Pair label="Registry standard"    value={row.registry_standard ?? '—'} />
            <Pair label="Sector"               value={SECTOR_LABEL[row.sector]} />
            <Pair label="Methodology"          value={`${row.methodology_id ?? '—'}${row.methodology_version ? ' · v' + row.methodology_version : ''}`} />
            <Pair label="Host country"         value={row.host_country ?? '—'} />
            <Pair label="Assessed annual"      value={fmtTco2e(row.assessed_annual_tco2e)} />
            <Pair label="Proponent"            value={row.proponent_party_name ?? '—'} />
            <Pair label="VVB"                  value={row.vvb_name ?? '—'} />
            <Pair label="Quality assessor"     value={row.quality_assessor_name ?? '—'} />
            <Pair label="Screening ref"        value={row.screening_ref ?? '—'} />
            <Pair label="Eligibility ref"      value={row.eligibility_check_ref ?? '—'} />
            <Pair label="Assessment ref"       value={row.assessment_ref ?? '—'} />
            <Pair label="VVB review ref"       value={row.vvb_review_ref ?? '—'} />
            <Pair label="Decision ref"         value={row.decision_ref ?? '—'} />
            <Pair label="Grant ref"            value={row.grant_ref ?? '—'} />
            <Pair label="Denial ref"           value={row.denial_ref ?? '—'} />
            <Pair label="CORSIA elig. ref"     value={row.corsia_eligibility_ref ?? '—'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Requested"            value={fmtDate(row.requested_at)} />
            <Pair label="Screening"            value={fmtDate(row.screening_at)} />
            <Pair label="Eligibility check"    value={fmtDate(row.eligibility_check_at)} />
            <Pair label="Assessment"           value={fmtDate(row.assessment_in_progress_at)} />
            <Pair label="VVB review"           value={fmtDate(row.vvb_review_at)} />
            <Pair label="Decision pending"     value={fmtDate(row.ccp_decision_pending_at)} />
            <Pair label="Label granted"        value={fmtDate(row.ccp_label_granted_at)} />
            <Pair label="Label denied"         value={fmtDate(row.ccp_label_denied_at)} />
            <Pair label="On hold"              value={fmtDate(row.on_hold_at)} />
            <Pair label="Returned"             value={fmtDate(row.returned_at)} />
            <Pair label="Disputed"             value={fmtDate(row.disputed_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
          </div>
          {row.conditional_grant_conditions && (
            <BasisBlock label="Conditional grant conditions" tone="#a06200" text={row.conditional_grant_conditions} />
          )}
          {row.assessment_summary && (
            <BasisBlock label="Assessment summary" tone="#1a3a5c" text={row.assessment_summary} />
          )}
          {row.request_basis && (
            <BasisBlock label="Request basis" tone="#1a3a5c" text={row.request_basis} />
          )}
          {row.screening_basis && (
            <BasisBlock label="Screening basis (ICVCM)" tone="#1a3a5c" text={row.screening_basis} />
          )}
          {row.eligibility_check_basis && (
            <BasisBlock label="Eligibility check basis (assessor)" tone="#1a3a5c" text={row.eligibility_check_basis} />
          )}
          {row.assessment_basis && (
            <BasisBlock label="Assessment basis (assessor)" tone="#a06200" text={row.assessment_basis} />
          )}
          {row.vvb_review_basis && (
            <BasisBlock label="VVB review basis" tone="#1a6b48" text={row.vvb_review_basis} />
          )}
          {row.decision_basis && (
            <BasisBlock label="Decision basis" tone="#a06200" text={row.decision_basis} />
          )}
          {row.grant_basis && (
            <BasisBlock label="Grant basis (ICVCM)" tone="#155724" text={row.grant_basis} />
          )}
          {row.denial_basis && (
            <BasisBlock label="Denial basis (ICVCM)" tone="#9b1f1f" text={row.denial_basis} />
          )}
          {row.hold_basis && (
            <BasisBlock label="Hold basis" tone="#8a4a00" text={row.hold_basis} />
          )}
          {row.return_basis && (
            <BasisBlock label="Return basis" tone="#8a4a00" text={row.return_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#7a1414" text={row.dispute_basis} />
          )}
          {row.withdrawal_basis && (
            <BasisBlock label="Withdrawal basis" tone="#6b1f1f" text={row.withdrawal_basis} />
          )}
        </section>

        {(nextAction || canHold || canReturn || canDispute || canDeny || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canDeny && (
                <button type="button"
                  onClick={() => onAct('deny-ccp-label', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-[#9b1f1f] hover:bg-red-50"
                >
                  {ACTION_LABEL['deny-ccp-label']}
                </button>
              )}
              {canHold && (
                <button type="button"
                  onClick={() => onAct('place-on-hold', row)}
                  className="rounded border border-yellow-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-yellow-50"
                >
                  {ACTION_LABEL['place-on-hold']}
                </button>
              )}
              {canReturn && (
                <button type="button"
                  onClick={() => onAct('return-for-remediation', row)}
                  className="rounded border border-yellow-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-yellow-50"
                >
                  {ACTION_LABEL['return-for-remediation']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-[#7a1414] hover:bg-[#fbd3d3]"
                >
                  {ACTION_LABEL['raise-dispute']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['withdraw']}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
