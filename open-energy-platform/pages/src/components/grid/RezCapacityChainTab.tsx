// Wave 94 — NTCSA Renewable-Energy-Zone (REZ) Capacity Allocation & Competitive
// Auction tab. The COMPETITIVE-ZONAL-ALLOCATION layer of a best-in-class system-
// operator stack. W58 grid-capacity-allocation is the generic FCFS queue; W28
// GCA the physical connection; W75 connection-energization the energization gate
// — W94 inserts the COMPETITIVE ZONAL AUCTION between them. Beats AEMO REZ /
// NYISO TPP / CAISO TPP / ERCOT CREZ / EU TYNDP / ENTSO-E TYNDP / NGESO HND /
// Hydro Quebec MRC via LIVE-scored ZONE-HEADROOM + multi-criteria WEIGHTED
// SCORE (price 0.50 + B-BBEE 0.20 + ED 0.15 + local-content 0.15 per DMRE 40%)
// + COMPETITION-RATIO + MILESTONE-COMPLIANCE % + FORFEIT-RATE % + PREDICTED-
// OPERATION-DATE.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'announcement_published' | 'application_submitted' | 'compliance_check'
  | 'shortlisted' | 'evaluation_complete' | 'award_proposed'
  | 'capacity_awarded' | 'financial_close_met' | 'construction_in_progress'
  | 'in_operation' | 'rejected' | 'forfeit' | 'withdrawn';

type Tier = 'minor' | 'standard' | 'material' | 'mega';

interface AllocationRow {
  [key: string]: unknown;
  id: string;
  allocation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trigger_kind: string | null;
  applicant_party_id: string;
  applicant_party_name: string | null;
  applicant_persona: string | null;
  applicant_contact: string | null;
  bbbee_level: number | null;
  allocation_class: string;
  zone_code: string;
  zone_name: string | null;
  technology: string | null;
  capacity_tier: Tier;
  authority_required: string | null;
  requested_capacity_mw: number;
  awarded_capacity_mw: number | null;
  zone_total_capacity_mw: number;
  zone_allocated_to_date_mw: number;
  zone_lots_available: number;
  zone_applications_in_round: number;
  zone_forfeit_to_date_mw: number;
  bid_price_zar_per_mwh: number;
  price_floor_zar_per_mwh: number;
  price_ceiling_zar_per_mwh: number;
  bbbee_score: number | null;
  ed_score: number | null;
  local_content_pct: number | null;
  weighted_score: number | null;
  award_clearance_price_zar_per_mw: number | null;
  financial_close_target_at: string | null;
  financial_close_actual_at: string | null;
  construction_start_target_at: string | null;
  construction_start_actual_at: string | null;
  operation_target_at: string | null;
  operation_actual_at: string | null;
  milestones_total: number;
  milestones_met_on_time: number;
  application_basis: string | null;
  evaluation_basis: string | null;
  award_basis: string | null;
  rejection_basis: string | null;
  forfeit_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  announcement_published_at: string;
  application_submitted_at: string | null;
  compliance_check_at: string | null;
  shortlisted_at: string | null;
  evaluation_complete_at: string | null;
  award_proposed_at: string | null;
  capacity_awarded_at: string | null;
  financial_close_met_at: string | null;
  construction_in_progress_at: string | null;
  in_operation_at: string | null;
  rejected_at: string | null;
  forfeit_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  // live-decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  sla_breached: boolean;
  sla_window_minutes: number;
  urgency_band: 'overdue' | 'urgent' | 'due_soon' | 'on_track' | 'closed';
  is_reportable_flag: boolean;
  high_tier_flag: boolean;
  floor_at_mega_class_flag: boolean;
  signature_class_flag: boolean;
  authority_required_live: string | null;
  effective_capacity_mw_live: number;
  tier_live: Tier;
  remaining_headroom_mw_live: number;
  competition_ratio_live: number;
  competition_intensity_band_live: 'low' | 'moderate' | 'high';
  price_score_live: number;
  local_content_score_live: number;
  weighted_score_live: number;
  local_content_meets_threshold_flag: boolean;
  milestone_compliance_pct_live: number;
  forfeit_rate_pct_live: number;
  predicted_operation_date_live: string | null;
  inbox_severity_live: 'low' | 'medium' | 'high' | 'critical';
  reportable_per_spec: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  in_operation_count: number;
  awarded_count: number;
  rejected_count: number;
  forfeit_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  floor_applied_count: number;
  local_content_meets_count: number;
  total_requested_mw: number;
  total_awarded_mw: number;
  total_forfeit_mw: number;
  total_headroom_mw: number;
}

const ALL_STATES = [
  'announcement_published',
  'application_submitted',
  'compliance_check',
  'shortlisted',
  'evaluation_complete',
  'award_proposed',
  'capacity_awarded',
  'financial_close_met',
  'construction_in_progress',
  'in_operation',
] as const;

const BRANCH_STATES = ['rejected', 'forfeit', 'withdrawn'] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                     label: 'Open' },
  { key: 'all',                      label: 'All' },
  { key: 'mega',                     label: 'Mega' },
  { key: 'material',                 label: 'Material' },
  { key: 'standard',                 label: 'Standard' },
  { key: 'minor',                    label: 'Minor' },
  { key: 'application_submitted',    label: 'Applications' },
  { key: 'evaluation_complete',      label: 'Evaluation' },
  { key: 'capacity_awarded',         label: 'Awarded' },
  { key: 'construction_in_progress', label: 'Construction' },
  { key: 'in_operation',             label: 'In operation' },
  { key: 'rejected',                 label: 'Rejected' },
  { key: 'forfeit',                  label: 'Forfeit' },
  { key: 'signature',                label: 'Floor-at-mega class' },
  { key: 'breached',                 label: 'SLA breached' },
  { key: 'reportable',               label: 'Reportable' },
];

const AUTHORITY_LABEL: Record<string, string> = {
  compliance_officer:   'Compliance officer',
  evaluation_panel:     'Evaluation panel',
  council_subcommittee: 'Council sub-committee',
  full_council:         'Full Council',
};

const TERMINAL_STATES: ChainStatus[] = ['in_operation', 'rejected', 'forfeit', 'withdrawn'];

function fmtMw(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}MW`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function getActions(row: AllocationRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'announcement_published') {
    actions.push({
      key: 'submit-application',
      label: 'Submit application (applicant)',
      tone: 'primary',
      fields: [
        { key: 'applicant_party_name', label: 'Applicant party name', type: 'text', required: false },
        { key: 'requested_capacity_mw', label: 'Requested capacity (MW) — tier MW-magnitude-derived', type: 'text', required: false },
        { key: 'bid_price_zar_per_mwh', label: 'Bid price (ZAR/MWh) — weight 0.50 in REIPPPP score', type: 'text', required: false },
        { key: 'bbbee_score', label: 'B-BBEE score (0-100) — weight 0.20', type: 'text', required: false },
        { key: 'ed_score', label: 'ED score (0-100) — weight 0.15', type: 'text', required: false },
        { key: 'local_content_pct', label: 'Local-content % — weight 0.15; DMRE 40% threshold for full credit', type: 'text', required: false },
        { key: 'application_basis', label: 'Application basis', type: 'textarea', required: false },
      ],
    });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'danger', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'application_submitted') {
    actions.push({
      key: 'check-compliance',
      label: 'Check compliance (compliance officer)',
      tone: 'primary',
      fields: [
        { key: 'evaluation_ref', label: 'Evaluation reference', type: 'text', required: false },
        { key: 'evaluation_basis', label: 'Compliance check basis — what was checked (DMRE rules, NTCSA Rules 2024 sub-100MW=30d)', type: 'textarea', required: false },
      ],
    });
    actions.push({ key: 'reject-application', label: 'Reject application', tone: 'danger', fields: [{ key: 'rejection_basis', label: 'Rejection basis — SO denial at compliance/evaluation/award', type: 'textarea', required: true }, { key: 'rejection_ref', label: 'Rejection reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'compliance_check') {
    actions.push({
      key: 'shortlist',
      label: 'Shortlist (compliance officer)',
      tone: 'primary',
      fields: [
        { key: 'evaluation_ref', label: 'Shortlist reference', type: 'text', required: false },
        { key: 'notes', label: 'Shortlist notes — competition ratio band', type: 'textarea', required: false },
      ],
    });
    actions.push({ key: 'reject-application', label: 'Reject application', tone: 'danger', fields: [{ key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: true }, { key: 'rejection_ref', label: 'Rejection reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'shortlisted') {
    actions.push({
      key: 'complete-evaluation',
      label: 'Complete evaluation (panel)',
      tone: 'primary',
      fields: [
        { key: 'weighted_score', label: 'Weighted score (0-1) — REIPPPP price 0.50 + B-BBEE 0.20 + ED 0.15 + local 0.15', type: 'text', required: false },
        { key: 'evaluation_ref', label: 'Evaluation reference', type: 'text', required: false },
        { key: 'evaluation_basis', label: 'Evaluation basis — multi-criteria scoring summary (mega crosses public scrutiny)', type: 'textarea', required: true },
      ],
    });
    actions.push({ key: 'reject-application', label: 'Reject application', tone: 'danger', fields: [{ key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: true }, { key: 'rejection_ref', label: 'Rejection reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'evaluation_complete') {
    actions.push({
      key: 'propose-award',
      label: 'Propose award (Council)',
      tone: 'primary',
      fields: [
        { key: 'awarded_capacity_mw', label: 'Awarded capacity (MW) — may be less than requested', type: 'text', required: false },
        { key: 'award_clearance_price_zar_per_mw', label: 'Award clearance price (ZAR/MW)', type: 'text', required: false },
        { key: 'award_ref', label: 'Award reference', type: 'text', required: false },
        { key: 'award_basis', label: 'Award basis — reasons for proposed quantum', type: 'textarea', required: true },
      ],
    });
    actions.push({ key: 'reject-application', label: 'Reject application', tone: 'danger', fields: [{ key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: true }, { key: 'rejection_ref', label: 'Rejection reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'award_proposed') {
    actions.push({
      key: 'award-capacity',
      label: 'Award capacity (Council) — W94 SIGNATURE',
      tone: 'primary',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'awarded_capacity_mw', label: 'Confirmed awarded capacity (MW) — W94 SIGNATURE (every tier crosses regulator)', type: 'text', required: true },
        { key: 'financial_close_target_at', label: 'Financial close target (YYYY-MM-DD)', type: 'text', required: false },
        { key: 'construction_start_target_at', label: 'Construction start target (YYYY-MM-DD)', type: 'text', required: false },
        { key: 'operation_target_at', label: 'Commercial operation target (YYYY-MM-DD)', type: 'text', required: false },
        { key: 'milestones_total', label: 'Total milestones to track', type: 'text', required: false },
        { key: 'award_ref', label: 'Award reference', type: 'text', required: false },
        { key: 'regulator_ref', label: 'Regulator reference (every award is publicly registered)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'reject-application', label: 'Reject application', tone: 'danger', fields: [{ key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: true }, { key: 'rejection_ref', label: 'Rejection reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'capacity_awarded') {
    actions.push({
      key: 'meet-financial-close',
      label: 'Mark financial close met',
      tone: 'primary',
      fields: [
        { key: 'fc_ref', label: 'Financial close reference', type: 'text', required: false },
        { key: 'financial_close_actual_at', label: 'Financial close actual date (YYYY-MM-DD)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'forfeit-allocation', label: 'Forfeit allocation — capacity recycled', tone: 'danger', cascadeTo: ['regulator', 'admin'], fields: [{ key: 'forfeit_basis', label: 'Forfeit basis — milestone failure; capacity recycled into the zone pool (W94 SIGNATURE crosses regulator every tier)', type: 'textarea', required: true }, { key: 'forfeit_ref', label: 'Forfeit reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'financial_close_met') {
    actions.push({
      key: 'start-construction',
      label: 'Start construction',
      tone: 'primary',
      fields: [
        { key: 'construction_ref', label: 'Construction reference', type: 'text', required: false },
        { key: 'construction_start_actual_at', label: 'Construction start actual date (YYYY-MM-DD)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'forfeit-allocation', label: 'Forfeit allocation — capacity recycled', tone: 'danger', cascadeTo: ['regulator', 'admin'], fields: [{ key: 'forfeit_basis', label: 'Forfeit basis — capacity recycled into the zone pool', type: 'textarea', required: true }, { key: 'forfeit_ref', label: 'Forfeit reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  if (s === 'construction_in_progress') {
    actions.push({
      key: 'confirm-operation',
      label: 'Confirm commercial operation (SO)',
      tone: 'primary',
      fields: [
        { key: 'operation_ref', label: 'Operation reference', type: 'text', required: false },
        { key: 'operation_actual_at', label: 'Commercial operation actual date (YYYY-MM-DD)', type: 'text', required: false },
        { key: 'energization_ref', label: 'Energization reference (W75 link)', type: 'text', required: false },
        { key: 'gca_ref', label: 'GCA reference (W28 link)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'forfeit-allocation', label: 'Forfeit allocation — capacity recycled', tone: 'danger', cascadeTo: ['regulator', 'admin'], fields: [{ key: 'forfeit_basis', label: 'Forfeit basis — capacity recycled into the zone pool', type: 'textarea', required: true }, { key: 'forfeit_ref', label: 'Forfeit reference', type: 'text', required: false }] });
    actions.push({ key: 'withdraw', label: 'Withdraw', tone: 'ghost', fields: [{ key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: true }] });
  }

  return actions;
}

function renderDetail(row: AllocationRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div className="space-y-4 text-[12px]">
      <section>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Live zone-headroom &amp; competition battery
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <DetailPair label="Zone total" value={fmtMw(row.zone_total_capacity_mw)} />
          <DetailPair label="Zone allocated to date" value={fmtMw(row.zone_allocated_to_date_mw)} />
          <DetailPair label="Remaining headroom (live)" value={fmtMw(row.remaining_headroom_mw_live)} />
          <DetailPair label="Zone forfeit to date" value={fmtMw(row.zone_forfeit_to_date_mw)} />
          <DetailPair label="Lots available" value={fmtNum(row.zone_lots_available, 0)} />
          <DetailPair label="Applications in round" value={fmtNum(row.zone_applications_in_round, 0)} />
          <DetailPair label="Competition ratio (live)" value={fmtNum(row.competition_ratio_live, 2)} />
          <DetailPair label="Competition intensity" value={row.competition_intensity_band_live} />
          <DetailPair label="Tier (live)" value={(row.tier_live ?? row.capacity_tier).toString()} />
          <DetailPair label="Floor at mega" value={row.floor_at_mega_class_flag ? 'Yes' : 'No'} />
          <DetailPair label="Forfeit rate %" value={fmtPct(row.forfeit_rate_pct_live, 1)} />
          <DetailPair label="Authority required" value={authority} />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          REIPPPP multi-criteria score (price 0.50 + B-BBEE 0.20 + ED 0.15 + local-content 0.15)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <DetailPair label="Bid price (ZAR/MWh)" value={fmtNum(row.bid_price_zar_per_mwh, 0)} />
          <DetailPair label="Price floor / ceiling" value={`${fmtNum(row.price_floor_zar_per_mwh, 0)} / ${fmtNum(row.price_ceiling_zar_per_mwh, 0)}`} />
          <DetailPair label="Price score (live)" value={fmtScore(row.price_score_live)} />
          <DetailPair label="B-BBEE score (raw)" value={fmtScore((row.bbbee_score ?? 0) / 100)} />
          <DetailPair label="ED score (raw)" value={fmtScore((row.ed_score ?? 0) / 100)} />
          <DetailPair label="Local content %" value={fmtPct(row.local_content_pct, 1)} />
          <DetailPair label="Local content score (live)" value={fmtScore(row.local_content_score_live)} />
          <DetailPair label="Local content threshold" value={row.local_content_meets_threshold_flag ? 'MET' : 'Below'} />
          <DetailPair label="Weighted score (live)" value={fmtScore(row.weighted_score_live)} />
          <DetailPair label="Weighted score (saved)" value={fmtScore(row.weighted_score)} />
          <DetailPair label="Clearance ZAR/MW" value={fmtNum(row.award_clearance_price_zar_per_mw, 0)} />
          <DetailPair label="Predicted operation" value={fmtDate(row.predicted_operation_date_live)} />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Milestone tracking
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <DetailPair label="Effective capacity (live)" value={fmtMw(row.effective_capacity_mw_live)} />
          <DetailPair label="Requested" value={fmtMw(row.requested_capacity_mw)} />
          <DetailPair label="Awarded" value={fmtMw(row.awarded_capacity_mw)} />
          <DetailPair label="FC target / actual" value={`${fmtDate(row.financial_close_target_at)} / ${fmtDate(row.financial_close_actual_at)}`} />
          <DetailPair label="Construction target / actual" value={`${fmtDate(row.construction_start_target_at)} / ${fmtDate(row.construction_start_actual_at)}`} />
          <DetailPair label="Operation target / actual" value={`${fmtDate(row.operation_target_at)} / ${fmtDate(row.operation_actual_at)}`} />
          <DetailPair label="Milestones met / total" value={`${row.milestones_met_on_time} / ${row.milestones_total}`} />
          <DetailPair label="Milestone compliance % (live)" value={fmtPct(row.milestone_compliance_pct_live, 1)} />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
          Chain metadata
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <DetailPair label="Allocation class" value={row.allocation_class} />
          <DetailPair label="Zone" value={`${row.zone_name ?? row.zone_code} (${row.zone_code})`} />
          <DetailPair label="Technology" value={row.technology ?? '—'} />
          <DetailPair label="Applicant" value={row.applicant_party_name ?? '—'} />
          <DetailPair label="B-BBEE level" value={row.bbbee_level != null ? `Level ${row.bbbee_level}` : '—'} />
          <DetailPair label="Inbox severity (live)" value={row.inbox_severity_live} />
          <DetailPair label="Announcement published" value={fmtDate(row.announcement_published_at)} />
          <DetailPair label="Application submitted" value={fmtDate(row.application_submitted_at)} />
          <DetailPair label="Compliance check" value={fmtDate(row.compliance_check_at)} />
          <DetailPair label="Shortlisted" value={fmtDate(row.shortlisted_at)} />
          <DetailPair label="Evaluation complete" value={fmtDate(row.evaluation_complete_at)} />
          <DetailPair label="Award proposed" value={fmtDate(row.award_proposed_at)} />
          <DetailPair label="Capacity awarded" value={fmtDate(row.capacity_awarded_at)} />
          <DetailPair label="Financial close met" value={fmtDate(row.financial_close_met_at)} />
          <DetailPair label="Construction in progress" value={fmtDate(row.construction_in_progress_at)} />
          <DetailPair label="In operation" value={fmtDate(row.in_operation_at)} />
          <DetailPair label="Escalation level" value={String(row.escalation_level)} />
          <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes (public register)' : 'No'} />
          {row.source_wave && (
            <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
          )}
        </div>
      </section>

      {row.application_basis && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2, marginBottom: 2 }}>Application basis</div>
          <div style={{ fontSize: 12, color: TX2, whiteSpace: 'pre-wrap' }}>{row.application_basis}</div>
        </div>
      )}
      {row.evaluation_basis && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: WARN, marginBottom: 2 }}>Evaluation basis</div>
          <div style={{ fontSize: 12, color: TX2, whiteSpace: 'pre-wrap' }}>{row.evaluation_basis}</div>
        </div>
      )}
      {row.award_basis && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: GOOD, marginBottom: 2 }}>Award basis</div>
          <div style={{ fontSize: 12, color: TX2, whiteSpace: 'pre-wrap' }}>{row.award_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: BAD, marginBottom: 2 }}>Rejection basis</div>
          <div style={{ fontSize: 12, color: BAD, whiteSpace: 'pre-wrap' }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.forfeit_basis && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: BAD, marginBottom: 2 }}>Forfeit basis (capacity recycled)</div>
          <div style={{ fontSize: 12, color: BAD, whiteSpace: 'pre-wrap' }}>{row.forfeit_basis}</div>
        </div>
      )}
      {row.withdrawal_basis && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Withdrawal basis</div>
          <div style={{ fontSize: 12, color: TX2, whiteSpace: 'pre-wrap' }}>{row.withdrawal_basis}</div>
        </div>
      )}
    </div>
  );
}

export function RezCapacityChainTab() {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AllocationRow[] } & KpiSummary }>('/grid/rez-capacity/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          in_operation_count: d.in_operation_count,
          awarded_count: d.awarded_count,
          rejected_count: d.rejected_count,
          forfeit_count: d.forfeit_count,
          withdrawn_count: d.withdrawn_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          floor_applied_count: d.floor_applied_count,
          local_content_meets_count: d.local_content_meets_count,
          total_requested_mw: d.total_requested_mw,
          total_awarded_mw: d.total_awarded_mw,
          total_forfeit_mw: d.total_forfeit_mw,
          total_headroom_mw: d.total_headroom_mw,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load REZ allocations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    // Build body based on action key, parsing numeric fields
    const body: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === '') continue;
      const numericFields = ['requested_capacity_mw', 'bid_price_zar_per_mwh', 'bbbee_score', 'ed_score', 'local_content_pct', 'awarded_capacity_mw', 'award_clearance_price_zar_per_mw', 'weighted_score', 'milestones_total'];
      if (numericFields.includes(k) && !Number.isNaN(Number(v))) {
        body[k] = Number(v);
      } else {
        body[k] = v;
      }
    }

    if (key === 'reject-application') { body.reason_code = 'rejected'; }
    if (key === 'forfeit-allocation') { body.reason_code = 'forfeit'; }
    if (key === 'withdraw')           { body.reason_code = 'withdrawn'; }

    await api.post(`/grid/rez-capacity/chain/${rowId}/${key}`, body);
    await load();
  }, [rows, load]);

  const handleExpand = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { allocation: AllocationRow; events: ChainEvent[] } }>(`/grid/rez-capacity/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
      // Update the row with fresh data if available
      if (res.data?.data?.allocation) {
        setRows(prev => prev.map(r => r.id === id ? res.data.data.allocation : r));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load allocation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'signature')  return r.signature_class_flag;
      if (['minor', 'standard', 'material', 'mega'].includes(filter)) {
        return r.capacity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: TX1, margin: 0 }}>
          REZ capacity allocation &amp; competitive auction (NTCSA 2024)
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          12-state competitive-auction chain · announcement_published → in_operation (terminal).
          Branches: rejected, forfeit (capacity recycled), withdrawn. COMPETITIVE-ZONAL-ALLOCATION
          layer upstream of W58 queue / W28 GCA / W75 energization. LIVE-scored ZONE-HEADROOM +
          REIPPPP WEIGHTED SCORE (price 0.50 + B-BBEE 0.20 + ED 0.15 + local-content 0.15).
          INVERTED SLA. W94 SIGNATURE — award_capacity and forfeit_allocation cross regulator every tier.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KpiTile label="Total allocations" value={summary?.total ?? rows.length} />
        <KpiTile label="Open" value={summary?.open_count ?? 0} tone={(summary?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="In operation" value={summary?.in_operation_count ?? 0} tone="ok" />
        <KpiTile label="Awarded" value={summary?.awarded_count ?? 0} tone="ok" />
        <KpiTile label="Rejected" value={summary?.rejected_count ?? 0} tone={(summary?.rejected_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Forfeit (recycled)" value={summary?.forfeit_count ?? 0} tone={(summary?.forfeit_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Floor-at-mega" value={summary?.floor_applied_count ?? 0} tone={(summary?.floor_applied_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="DMRE local-content met" value={summary?.local_content_meets_count ?? 0} tone="ok" />
        <KpiTile label="SLA breached" value={summary?.breached ?? 0} tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable" value={summary?.reportable_total ?? 0} tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Total awarded" value={fmtMw(summary?.total_awarded_mw)} />
        <KpiTile label="Forfeit MW" value={fmtMw(summary?.total_forfeit_mw)} tone={(summary?.total_forfeit_mw ?? 0) > 0 ? 'warn' : 'ok'} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              transition: 'background 120ms, color 120ms',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 4, border: `1px solid ${BAD}40`, background: `${BAD}10`, fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          No allocations match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => {
            const actions = getActions(row);
            const meta = (
              <span>
                {row.zone_name ?? row.zone_code}
                {row.technology ? ` · ${row.technology}` : ''}
                {` · ${row.allocation_class}`}
                {` · ${row.capacity_tier}`}
                {` · Req: ${fmtMw(row.requested_capacity_mw)}`}
                {row.awarded_capacity_mw != null ? ` · Awd: ${fmtMw(row.awarded_capacity_mw)}` : ''}
                {row.weighted_score_live != null ? ` · Score: ${fmtScore(row.weighted_score_live)}` : ''}
                {row.is_reportable_flag ? ' · ● Reportable' : ''}
                {row.signature_class_flag ? ' · ★ Floor-at-mega' : ''}
                {row.local_content_meets_threshold_flag ? ' · ▲ DMRE met' : ''}
              </span>
            );

            return (
              <ChainCard
                key={row.id}
                item={{
                  ...row,
                  case_number: row.allocation_number,
                }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.applicant_party_name ?? row.allocation_number}
                meta={meta}
                actions={actions}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={['regulator', 'admin']}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
                detail={renderDetail(row)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: MONO, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 1 }}>{value}</div>
    </div>
  );
}

export default RezCapacityChainTab;
