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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  trigger_event:                  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Triggered' },
  preliminary_assessment:         { bg: '#ffe4b5', fg: '#8a4a00', label: 'Preliminary assessment' },
  restructure_proposal_drafted:   { bg: '#fff4d6', fg: '#a06200', label: 'Proposal drafted' },
  lender_credit_committee_review: { bg: '#fff4d6', fg: '#a06200', label: 'Credit committee review' },
  borrower_term_sheet_negotiation:{ bg: '#dbecfb', fg: '#1a3a5c', label: 'Term-sheet negotiation' },
  term_sheet_signed:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Term-sheet signed' },
  legal_documentation_drafted:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Documentation drafted' },
  consent_solicitation:           { bg: '#ffd9b3', fg: '#8a4a00', label: 'Consent solicitation' },
  signing:                        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Signing' },
  effective_date:                 { bg: '#d4edda', fg: '#155724', label: 'Effective' },
  monitoring_period:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Monitoring' },
  completed:                      { bg: '#d4edda', fg: '#155724', label: 'Completed' },
  rejected_by_committee:          { bg: '#f3c0c0', fg: '#5a1818', label: 'Rejected by committee' },
  abandoned:                      { bg: '#e3e7ec', fg: '#557',    label: 'Abandoned' },
  escalated_to_default:           { bg: '#f3c0c0', fg: '#5a1818', label: 'Escalated to W45' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#d4edda', fg: '#155724', label: 'Minor (<R50m)' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (R50m-R500m)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (R500m-R5b)' },
  systemic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Systemic (>=R5b)' },
};

const URGENCY_TONE: Record<Urgency, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  medium:   { bg: '#fff4d6', fg: '#a06200', label: 'Medium' },
  low:      { bg: '#d4edda', fg: '#155724', label: 'Low' },
};

const AUTHORITY_LABEL: Record<Authority, string> = {
  relationship_manager:     'Relationship manager',
  credit_committee:         'Credit committee',
  portfolio_director:       'Portfolio director',
  CRO:                      'CRO',
  board_credit_subcommittee:'Board credit subcommittee',
};

const CONSENT_LABEL: Record<ConsentSeverity, string> = {
  simple_majority:  'Simple majority (50%)',
  special_majority: 'Special majority (66.7%)',
  super_majority:   'Super majority (75%)',
  unanimity:        'Unanimity (100%)',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                            label: 'Open' },
  { key: 'all',                             label: 'All' },
  // Tier filters
  { key: 'minor',                           label: 'Minor' },
  { key: 'standard',                        label: 'Standard' },
  { key: 'material',                        label: 'Material' },
  { key: 'systemic',                        label: 'Systemic' },
  // Status filters
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
  // Action filters
  { key: 'breached',                        label: 'SLA breached' },
  { key: 'reportable',                      label: 'Reportable' },
  { key: 'consent_open',                    label: 'Awaiting consent' },
  { key: 'critical',                        label: 'Critical urgency' },
  { key: 'ifrs9_3',                         label: 'IFRS 9 Stage 3' },
  { key: 'public_bondholder',               label: 'Public bondholder' },
  { key: 'sarb_le',                         label: 'SARB large exposure' },
  { key: 'covenant_bridged',                label: 'W38 covenant bridge' },
  { key: 'dscr_bridged',                    label: 'W86 DSCR bridge' },
  { key: 'board_escalated',                 label: 'Board escalation' },
];

type ActionKind =
  | 'start-preliminary-assessment' | 'draft-proposal' | 'submit-to-credit-committee'
  | 'approve-proposal' | 'reject-proposal' | 'revise-proposal'
  | 'negotiate-term-sheet' | 'sign-term-sheet' | 'draft-documentation'
  | 'launch-consent-solicitation' | 'record-consent' | 'sign-amendment'
  | 'mark-effective' | 'monitor-compliance' | 'complete-restructure'
  | 'abandon' | 'escalate-to-default';

// Allowed actions per state — primary forward action first. Mirrors the spec
// TRANSITIONS map so the UI never offers an invalid step. abandon + escalate-
// to-default are universally available across non-terminal states except as
// noted (abandon excluded from effective_date+monitoring_period; escalate
// excluded only from hard terminals).
const ALLOWED_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  trigger_event:                  ['start-preliminary-assessment', 'abandon', 'escalate-to-default'],
  preliminary_assessment:         ['draft-proposal', 'abandon', 'escalate-to-default'],
  restructure_proposal_drafted:   ['submit-to-credit-committee', 'abandon', 'escalate-to-default'],
  lender_credit_committee_review: ['approve-proposal', 'revise-proposal', 'reject-proposal', 'abandon', 'escalate-to-default'],
  borrower_term_sheet_negotiation:['negotiate-term-sheet', 'sign-term-sheet', 'abandon', 'escalate-to-default'],
  term_sheet_signed:              ['draft-documentation', 'abandon', 'escalate-to-default'],
  legal_documentation_drafted:    ['launch-consent-solicitation', 'abandon', 'escalate-to-default'],
  consent_solicitation:           ['record-consent', 'sign-amendment', 'abandon', 'escalate-to-default'],
  signing:                        ['mark-effective', 'abandon', 'escalate-to-default'],
  effective_date:                 ['monitor-compliance', 'escalate-to-default'],
  monitoring_period:              ['monitor-compliance', 'complete-restructure', 'escalate-to-default'],
  completed:                      [],
  rejected_by_committee:          [],
  abandoned:                      [],
  escalated_to_default:           [],
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'start-preliminary-assessment': 'Start preliminary assessment (lender)',
  'draft-proposal':               'Draft restructure proposal (lender)',
  'submit-to-credit-committee':   'Submit to credit committee (lender)',
  'approve-proposal':             'Approve proposal (lender)',
  'reject-proposal':              'Reject proposal (lender)',
  'revise-proposal':              'Send back for revision (borrower)',
  'negotiate-term-sheet':         'Negotiate term sheet (borrower)',
  'sign-term-sheet':              'Sign term sheet (borrower)',
  'draft-documentation':          'Draft amendment documentation (lender)',
  'launch-consent-solicitation':  'Launch consent solicitation (lender)',
  'record-consent':               'Record syndicate consent (syndicate member)',
  'sign-amendment':               'Sign amendment (borrower)',
  'mark-effective':               'Mark effective date (lender)',
  'monitor-compliance':           'Monitor compliance (lender)',
  'complete-restructure':         'Complete restructure (lender)',
  'abandon':                      'Abandon (borrower)',
  'escalate-to-default':          'Escalate to default — feeds W45 (lender)',
};

const ACTION_TONE: Record<ActionKind, 'primary' | 'danger' | 'warn' | 'good' | 'muted'> = {
  'start-preliminary-assessment': 'primary',
  'draft-proposal':               'primary',
  'submit-to-credit-committee':   'primary',
  'approve-proposal':             'good',
  'reject-proposal':              'warn',
  'revise-proposal':              'warn',
  'negotiate-term-sheet':         'primary',
  'sign-term-sheet':              'good',
  'draft-documentation':          'primary',
  'launch-consent-solicitation':  'primary',
  'record-consent':               'primary',
  'sign-amendment':               'good',
  'mark-effective':               'good',
  'monitor-compliance':           'primary',
  'complete-restructure':         'good',
  'abandon':                      'muted',
  'escalate-to-default':          'danger',
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

const TERMINAL_STATES: ChainStatus[] = ['completed', 'rejected_by_committee', 'abandoned', 'escalated_to_default'];

export function LoanRestructureChainTab() {
  const [rows, setRows] = useState<LrsRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<LrsRow | null>(null);
  const [events, setEvents] = useState<LrsEvent[]>([]);

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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: LrsRow; events: LrsEvent[] } }>(
        `/lender/loan-restructure/chain/${id}`,
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load restructure history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'open')            return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')        return !!(r.sla_breached_live || r.sla_breached);
      if (filter === 'reportable')      return !!r.is_reportable_flag;
      if (filter === 'consent_open')    return r.chain_status === 'consent_solicitation';
      if (filter === 'critical')        return r.urgency_band_live === 'critical';
      if (filter === 'ifrs9_3')         return !!r.ifrs9_stage_3_at_trigger;
      if (filter === 'public_bondholder') return !!r.public_bondholder_consent_required;
      if (filter === 'sarb_le')         return !!r.sarb_large_exposure_threshold;
      if (filter === 'covenant_bridged') return !!r.bridges_to_covenant_certificate_chain_live;
      if (filter === 'dscr_bridged')    return !!r.bridges_to_dscr_monitoring_chain_live;
      if (filter === 'board_escalated') return !!r.board_escalation_required_live;
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'systemic') {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: LrsRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'start-preliminary-assessment') {
        const basis = window.prompt('Basis — lender desk opening preliminary forbearance assessment:');
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'draft-proposal') {
        const basis = window.prompt('Basis — drafting restructure proposal (forbearance window, principal reschedule, maturity extension):');
        if (!basis) return;
        const fb = window.prompt('Forbearance period (months):', String(row.forbearance_period_months ?? 0));
        const pr = window.prompt('Principal reschedule amount (ZAR):', String(row.principal_reschedule_zar ?? 0));
        const me = window.prompt('Maturity extension (months):', String(row.maturity_extension_months ?? 0));
        const eq = window.prompt('Equity cure quantum (ZAR, 0 if none):', String(row.equity_cure_quantum_zar ?? 0));
        const cs = window.prompt('Consent severity — simple_majority / special_majority / super_majority / unanimity:', row.consent_severity || 'special_majority');
        body = { narrative: basis };
        if (fb && !Number.isNaN(Number(fb))) body.forbearance_period_months = Number(fb);
        if (pr && !Number.isNaN(Number(pr))) body.principal_reschedule_zar = Number(pr);
        if (me && !Number.isNaN(Number(me))) body.maturity_extension_months = Number(me);
        if (eq && !Number.isNaN(Number(eq))) body.equity_cure_quantum_zar = Number(eq);
        if (cs) body.consent_severity = cs;
      } else if (action === 'submit-to-credit-committee') {
        const basis = window.prompt(
          'Basis — submitting proposal to credit committee. Crosses regulator EVERY tier on systemic or IFRS 9 Stage 3 (Companies Act §155 Compromise):',
        );
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'approve-proposal') {
        const basis = window.prompt('Basis — credit committee approval; moving to borrower term-sheet negotiation:');
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'reject-proposal') {
        const basis = window.prompt('Basis — credit committee rejection (terminal):');
        if (!basis) return;
        const reason = window.prompt('Rejection reason (e.g. insufficient_relief / bankability_failed / risk_unacceptable):') || '';
        body = { narrative: basis };
        if (reason) body.rejection_reason = reason;
      } else if (action === 'revise-proposal') {
        const basis = window.prompt('Basis — sending proposal back for revision; returning to restructure_proposal_drafted loop:');
        if (!basis) return;
        const fb = window.prompt('Revised forbearance period (months):', String(row.forbearance_period_months ?? 0));
        const pr = window.prompt('Revised principal reschedule (ZAR):', String(row.principal_reschedule_zar ?? 0));
        const me = window.prompt('Revised maturity extension (months):', String(row.maturity_extension_months ?? 0));
        const eq = window.prompt('Revised equity cure (ZAR):', String(row.equity_cure_quantum_zar ?? 0));
        body = { narrative: basis };
        if (fb && !Number.isNaN(Number(fb))) body.forbearance_period_months = Number(fb);
        if (pr && !Number.isNaN(Number(pr))) body.principal_reschedule_zar = Number(pr);
        if (me && !Number.isNaN(Number(me))) body.maturity_extension_months = Number(me);
        if (eq && !Number.isNaN(Number(eq))) body.equity_cure_quantum_zar = Number(eq);
      } else if (action === 'negotiate-term-sheet') {
        const basis = window.prompt('Basis — borrower negotiating commercial terms; self-loop until sign_term_sheet:');
        if (!basis) return;
        const fb = window.prompt('Forbearance period (months):', String(row.forbearance_period_months ?? 0));
        const pr = window.prompt('Principal reschedule (ZAR):', String(row.principal_reschedule_zar ?? 0));
        const me = window.prompt('Maturity extension (months):', String(row.maturity_extension_months ?? 0));
        const eq = window.prompt('Equity cure (ZAR):', String(row.equity_cure_quantum_zar ?? 0));
        body = { narrative: basis };
        if (fb && !Number.isNaN(Number(fb))) body.forbearance_period_months = Number(fb);
        if (pr && !Number.isNaN(Number(pr))) body.principal_reschedule_zar = Number(pr);
        if (me && !Number.isNaN(Number(me))) body.maturity_extension_months = Number(me);
        if (eq && !Number.isNaN(Number(eq))) body.equity_cure_quantum_zar = Number(eq);
      } else if (action === 'sign-term-sheet') {
        const basis = window.prompt('Basis — borrower signs term sheet; locking commercial terms before legal documentation:');
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'draft-documentation') {
        const basis = window.prompt('Basis — drafting amendment documentation (LMA Amend & Extend pack):');
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'launch-consent-solicitation') {
        const basis = window.prompt(
          'Basis — launching syndicate consent solicitation. Crosses regulator strategic on public_bondholder_consent_required:',
        );
        if (!basis) return;
        const cs = window.prompt('Consent severity — simple_majority / special_majority / super_majority / unanimity:', row.consent_severity || 'special_majority');
        const deadline = window.prompt('Consent deadline (YYYY-MM-DD or ISO 8601):', '');
        body = { narrative: basis };
        if (cs) body.consent_severity = cs;
        if (deadline) body.consent_deadline_at = deadline;
      } else if (action === 'record-consent') {
        const basis = window.prompt('Basis — recording syndicate-member consent receipt:');
        if (!basis) return;
        const consented = window.prompt('Cumulative syndicate members consented:', String(row.syndicate_consented ?? 0));
        body = { narrative: basis };
        if (consented && !Number.isNaN(Number(consented))) body.syndicate_consented = Number(consented);
      } else if (action === 'sign-amendment') {
        const basis = window.prompt('Basis — borrower signs the amendment (LMA Amend & Extend document):');
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'mark-effective') {
        const basis = window.prompt(
          'Basis — marking the restructure effective. Crosses regulator material+systemic (SARB Banks Act §61 large-exposure disclosure):',
        );
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'monitor-compliance') {
        const basis = window.prompt('Basis — monitoring restructured-loan compliance (self-loop on monitoring_period):');
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'complete-restructure') {
        const basis = window.prompt('Basis — first cure period complete; closing the restructure case (hard terminal):');
        if (!basis) return;
        body = { narrative: basis };
      } else if (action === 'abandon') {
        const basis = window.prompt('Basis — borrower abandoning the restructure attempt (terminal — only pre-effective states):');
        if (!basis) return;
        const reason = window.prompt('Abandon reason (e.g. borrower_withdrawal / alternative_finance / refinance_completed):') || '';
        body = { narrative: basis };
        if (reason) body.abandon_reason = reason;
      } else if (action === 'escalate-to-default') {
        const basis = window.prompt(
          'Basis — escalating to default; failed restructure feeds W45 enforcement chain. SIGNATURE — crosses regulator EVERY tier (Basel III IFRS 9 Stage 3 + LMA event of default + SARB Banks Act §61):',
        );
        if (!basis) return;
        const reason = window.prompt('Escalation reason (e.g. consent_failed / borrower_default / restructure_unworkable / abandoned_mid_cure):') || '';
        const defRef = window.prompt('W45 default chain ref (optional, leave blank to create new):') || '';
        body = { narrative: basis };
        if (reason) body.escalation_reason = reason;
        if (defRef) body.default_chain_ref = defRef;
      }
      await api.post(`/lender/loan-restructure/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">
            Loan restructure & A&amp;E — the structured-forbearance runway
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 loan restructure / Amendment-and-Extend lifecycle — fills the structured-forbearance gap between
            W38 covenant certificate (point-in-time breach detection) + W86 DSCR monitoring (rolling coverage watch) and
            W45 default enforcement (acceleration / step-in). Without W108 every breach escalates straight to acceleration,
            which kills bankability. Beats LMA "Amend &amp; Extend" templates / Fitch RestructuringRating / S&amp;P Recovery
            Ratings / Moody's Covenant Quality Index / Reorg Research RestructuringDB / Debtwire Restructuring / Crescendo
            / Houlihan Lokey / FTI / AlixPartners — each surfaces restructure as a TRANSACTION (term-sheet + amendment doc);
            W108 makes it a 12-state P6 chain with INVERTED SLA polarity (systemic = LONGEST runway because LMA syndicate
            fairness + SARB disclosure rules need time), FLOOR-AT-MATERIAL tier overlay, 5-step authority ladder
            (relationship_manager {'→'} credit_committee {'→'} portfolio_director {'→'} CRO {'→'} board_credit_subcommittee),
            16-field LIVE battery (SLA hours remaining, urgency band, authority required, board escalation, regulator
            filing window, consent threshold / majority / passed, days to consent deadline, floor flag count, proposed
            relief ZAR, principal reschedule pct, IFRS 9 stage, completeness index 0-130, 3-bridge architecture to W38 +
            W86 + W45), and signature regulator crossings. Standards: LMA Amendment &amp; Extension template + Basel III
            IFRS 9 Stage 2/3 + SARB Banks Act §61 (forbearance disclosure) + Companies Act §155 (Compromise with
            creditors). SIGNATURE — escalate_to_default crosses the regulator EVERY tier (W108 hard line, failed
            restructure feeding W45 universally reportable, sister of W104 reject EVERY tier on regulator_relevant /
            W105 raise_dispute EVERY tier on HV_brp / W106 impose_sanction EVERY tier on licence_revocation / W107
            reject_order EVERY tier on credit_grade_below_B). submit_to_credit_committee crosses EVERY tier on systemic
            or IFRS 9 Stage 3 (Companies Act §155 Compromise trigger). mark_effective crosses material+systemic (SARB
            large-exposure disclosure). launch_consent_solicitation crosses strategic on public_bondholder only.
            sla_breached crosses material+systemic. Write {'{'}admin, lender{'}'}; READ all 9 personas;
            actor_party derived from action (lender / borrower / syndicate_member).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Active" value={kpis?.active_count ?? 0} tone={(kpis?.active_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Awaiting consent" value={kpis?.consent_open_count ?? 0} tone={(kpis?.consent_open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Completed" value={kpis?.completed_count ?? 0} tone="ok" />
        <Kpi label="Escalated to W45" value={kpis?.escalated_count ?? 0} tone={(kpis?.escalated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Abandoned" value={kpis?.abandoned_count ?? 0} />
        <Kpi label="Systemic" value={kpis?.systemic_count ?? 0} tone={(kpis?.systemic_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Material" value={kpis?.material_count ?? 0} tone={(kpis?.material_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="IFRS 9 Stage 3" value={kpis?.ifrs9_stage_3_count ?? 0} tone={(kpis?.ifrs9_stage_3_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Public bondholder" value={kpis?.public_bondholder_count ?? 0} tone={(kpis?.public_bondholder_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SARB large exposure" value={kpis?.sarb_le_count ?? 0} tone={(kpis?.sarb_le_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Board escalation" value={kpis?.board_escalated_count ?? 0} tone={(kpis?.board_escalated_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="W38 covenant bridge" value={kpis?.covenant_bridged_count ?? 0} />
        <Kpi label="W86 DSCR bridge" value={kpis?.dscr_bridged_count ?? 0} />
        <Kpi label="W45 default bridge" value={kpis?.default_bridged_count ?? 0} tone={(kpis?.default_bridged_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Total facility" value={fmtZar(kpis?.total_facility_zar ?? 0)} />
        <Kpi label="Total outstanding" value={fmtZar(kpis?.total_outstanding_zar ?? 0)} />
        <Kpi label="Total relief proposed" value={fmtZar(kpis?.total_relief_zar ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Restructure #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Borrower / Facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Consent</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.current_tier];
                const ub = r.urgency_band_live ? URGENCY_TONE[r.urgency_band_live] : null;
                const consentPassed = r.consent_majority_passed_live;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.restructure_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {!!r.public_bondholder_consent_required && <span className="ml-1 text-[#9b1f1f]" title="Public bondholder consent required">▲</span>}
                      {!!r.ifrs9_stage_3_at_trigger && <span className="ml-1 text-[#9b1f1f]" title="IFRS 9 Stage 3 at trigger">✦</span>}
                      {!!r.bridges_to_default_chain_live && <span className="ml-1 text-[#9b1f1f]" title="Bridges to W45 default chain">→W45</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[220px] truncate" title={`${r.borrower_name ?? ''} · ${r.facility_name ?? ''}`}>
                      <div className="font-medium">{r.borrower_name ?? '—'}</div>
                      <div className="text-[10px] text-[#4a5568] truncate">{r.facility_name ?? r.facility_id}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtZar(r.facility_amount_zar)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {ub ? (
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ub.bg, color: ub.fg }}>
                          {ub.label}
                        </span>
                      ) : <span className="text-[#4a5568]">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.chain_status === 'consent_solicitation' ? (
                        <span
                          className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background: consentPassed ? '#d4edda' : '#fff4d6',
                            color: consentPassed ? '#155724' : '#a06200',
                          }}
                          title={`${fmtPct(r.consent_majority_pct_live)} / ${fmtPct(r.consent_threshold_pct_live)} threshold`}
                        >
                          {fmtPct(r.consent_majority_pct_live)} / {fmtPct(r.consent_threshold_pct_live)}
                        </span>
                      ) : <span className="text-[#4a5568]">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${(r.sla_breached_live || r.sla_breached) ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : (r.sla_breached_live || r.sla_breached) ? 'BREACHED' : fmtHours(r.hours_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No restructure cases match.</td></tr>
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

const BTN_CLASS: Record<'primary' | 'danger' | 'warn' | 'good' | 'muted', string> = {
  primary: 'rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]',
  danger:  'rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50',
  warn:    'rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50',
  good:    'rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-800 hover:bg-green-50',
  muted:   'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]',
};

function Drawer({
  row, events, onClose, onAct,
}: {
  row: LrsRow;
  events: LrsEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: LrsRow) => void;
}) {
  const actions = ALLOWED_ACTIONS[row.chain_status] || [];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.restructure_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.borrower_name ?? '—'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.facility_name ?? row.facility_id}
                {row.project_name ? ` · ${row.project_name}` : ''}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label}
                {row.urgency_band_live ? ` · urgency ${URGENCY_TONE[row.urgency_band_live].label.toLowerCase()}` : ''}
                {row.authority_required_live ? ` · authority ${AUTHORITY_LABEL[row.authority_required_live]}` : ''}
                {row.board_escalation_required_live ? ` · BOARD ESCALATION` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.lender_agent_name ?? row.lender_agent_id} (agent) {'→'} {row.borrower_name ?? row.borrower_id}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                Syndicate {row.syndicate_size} · facility {fmtZar(row.facility_amount_zar)} · outstanding {fmtZar(row.outstanding_debt_zar)}
              </div>
              {(row.bridges_to_covenant_certificate_chain_live ||
                row.bridges_to_dscr_monitoring_chain_live ||
                row.bridges_to_default_chain_live) && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Bridges:
                  {row.bridges_to_covenant_certificate_chain_live && (
                    <span className="ml-1.5 rounded bg-[#dbecfb] px-1.5 py-0.5 text-[10px] font-medium text-[#1a3a5c]">
                      W38 {row.covenant_breach_ref ?? ''}
                    </span>
                  )}
                  {row.bridges_to_dscr_monitoring_chain_live && (
                    <span className="ml-1.5 rounded bg-[#dbecfb] px-1.5 py-0.5 text-[10px] font-medium text-[#1a3a5c]">
                      W86 {row.dscr_shortfall_ref ?? ''}
                    </span>
                  )}
                  {row.bridges_to_default_chain_live && (
                    <span className="ml-1.5 rounded bg-[#f3c0c0] px-1.5 py-0.5 text-[10px] font-medium text-[#5a1818]">
                      W45 {row.default_chain_ref ?? '(new)'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Live forbearance battery (16-field)</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="SLA hours remaining"      value={fmtHours(row.sla_hours_remaining_live)} />
            <Pair label="SLA window (status)"      value={fmtHours(row.sla_window_hours)} />
            <Pair label="Urgency band"             value={row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live].label : '—'} />
            <Pair label="Authority required"       value={row.authority_required_live ? AUTHORITY_LABEL[row.authority_required_live] : '—'} />
            <Pair label="Board escalation"         value={row.board_escalation_required_live ? 'YES' : 'No'} />
            <Pair label="Regulator filing window"  value={fmtHours(row.regulator_filing_window_hours_live)} />
            <Pair label="Consent severity"         value={row.consent_severity ? CONSENT_LABEL[row.consent_severity] : '—'} />
            <Pair label="Consent threshold"        value={fmtPct(row.consent_threshold_pct_live)} />
            <Pair label="Consent majority"         value={fmtPct(row.consent_majority_pct_live)} />
            <Pair label="Consent passed"           value={row.consent_majority_passed_live ? 'YES' : 'No'} />
            <Pair label="Days to consent deadline" value={fmtDays(row.days_to_consent_deadline_live)} />
            <Pair label="Floor flag count"         value={fmtNum(row.floor_flag_count_live, 0)} />
            <Pair label="Proposed relief (ZAR)"    value={fmtZar(row.proposed_relief_zar_live)} />
            <Pair label="Principal reschedule %"   value={fmtPct(row.principal_reschedule_pct_live, 2)} />
            <Pair label="IFRS 9 stage at trigger"  value={row.ifrs9_stage_at_trigger_live ? `Stage ${row.ifrs9_stage_at_trigger_live}` : '—'} />
            <Pair label="Completeness index"       value={`${row.restructure_completeness_index_live ?? 0} / 130`} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Restructure terms</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Forbearance period"       value={`${row.forbearance_period_months} mo`} />
            <Pair label="Maturity extension"       value={`${row.maturity_extension_months} mo`} />
            <Pair label="Principal reschedule"     value={fmtZar(row.principal_reschedule_zar)} />
            <Pair label="Principal reschedule %"   value={fmtPct(row.principal_reschedule_pct, 2)} />
            <Pair label="Equity cure quantum"      value={fmtZar(row.equity_cure_quantum_zar)} />
            <Pair label="Proposed relief"          value={fmtZar(row.proposed_relief_zar)} />
            <Pair label="Debt service / month"     value={fmtZar(row.debt_service_per_month_zar)} />
            <Pair label="Outstanding debt"         value={fmtZar(row.outstanding_debt_zar)} />
            <Pair label="Syndicate size"           value={String(row.syndicate_size)} />
            <Pair label="Syndicate consented"      value={`${row.syndicate_consented} / ${row.syndicate_size}`} />
            <Pair label="Consent deadline"         value={fmtDate(row.consent_deadline_at)} />
            <Pair label="Trigger reason"           value={row.trigger_reason_code ?? '—'} />
            <Pair label="Cross-border syndicate"   value={row.cross_border_syndicate ? 'Yes' : 'No'} />
            <Pair label="Sustainability-linked"    value={row.sustainability_linked_loan ? 'Yes' : 'No'} />
            <Pair label="Public bondholder"        value={row.public_bondholder_consent_required ? 'Yes' : 'No'} />
            <Pair label="IFRS 9 Stage 3 trigger"   value={row.ifrs9_stage_3_at_trigger ? 'Yes' : 'No'} />
            <Pair label="SARB large exposure"      value={row.sarb_large_exposure_threshold ? 'Yes' : 'No'} />
            <Pair label="Was on watch at trigger"  value={row.was_on_watch_at_trigger ? 'Yes' : 'No'} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Lifecycle timeline</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Triggered"                value={fmtDate(row.trigger_event_at)} />
            <Pair label="Preliminary assessment"   value={fmtDate(row.preliminary_assessment_at)} />
            <Pair label="Proposal drafted"         value={fmtDate(row.restructure_proposal_drafted_at)} />
            <Pair label="Committee review"         value={fmtDate(row.lender_credit_committee_review_at)} />
            <Pair label="TS negotiation"           value={fmtDate(row.borrower_term_sheet_negotiation_at)} />
            <Pair label="TS signed"                value={fmtDate(row.term_sheet_signed_at)} />
            <Pair label="Documentation drafted"    value={fmtDate(row.legal_documentation_drafted_at)} />
            <Pair label="Consent solicitation"     value={fmtDate(row.consent_solicitation_at)} />
            <Pair label="Signing"                  value={fmtDate(row.signing_at)} />
            <Pair label="Effective date"           value={fmtDate(row.effective_date_at)} />
            <Pair label="Monitoring period"        value={fmtDate(row.monitoring_period_at)} />
            <Pair label="Completed"                value={fmtDate(row.completed_at)} />
            <Pair label="Rejected by committee"    value={fmtDate(row.rejected_by_committee_at)} />
            <Pair label="Abandoned"                value={fmtDate(row.abandoned_at)} />
            <Pair label="Escalated to default"     value={fmtDate(row.escalated_to_default_at)} />
            <Pair label="SLA deadline"             value={fmtDate(row.sla_deadline_at)} />
            <Pair label="Last SLA breach"          value={fmtDate(row.last_sla_breach_at)} />
            <Pair label="SLA status"               value={row.is_terminal ? '—' : (row.sla_breached_live || row.sla_breached) ? 'BREACHED' : fmtHours(row.hours_until_sla)} />
            <Pair label="Escalation lvl"           value={String(row.escalation_level)} />
            <Pair label="Reportable"               value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Reason code"              value={row.reason_code ?? '—'} />
            <Pair label="Rejection reason"         value={row.rejection_reason ?? '—'} />
            <Pair label="Abandon reason"           value={row.abandon_reason ?? '—'} />
            <Pair label="Escalation reason"        value={row.escalation_reason ?? '—'} />
            <Pair label="Regulator crossed at"     value={fmtDate(row.regulator_crossed_at)} />
            <Pair label="Regulator ref"            value={row.regulator_ref ?? '—'} />
          </div>
          {row.narrative && (
            <BasisBlock label="Narrative" tone="#1a3a5c" text={row.narrative} />
          )}
        </section>

        {actions.length > 0 && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <button type="button"
                  key={a}
                  onClick={() => onAct(a, row)}
                  className={idx === 0 ? BTN_CLASS.primary : BTN_CLASS[ACTION_TONE[a]]}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
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
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} {'→'} {e.to_status ?? '—'}</span>
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
