// Wave 97 — IPP Daily Field Report / Progress Diary tab.
//
// The construction-day record for a best-in-class IPP-PM stack.
// Beats Procore Daily Log, Aconex Daily Site Diary, Buildertrend, Fieldwire,
// Raken, PlanGrid Daily Field Report, e-Builder daily logs via:
//   - 12-state P6 lifecycle (drafted → open → entries_open → close_entries →
//     entries_closed → submit → submitted → start_review → under_review →
//     approve → approved → distribute → distributed → archive → archived)
//     plus return_for_correction → corrected → submit (rejoin) and the
//     void / withdraw exception terminals
//   - tier RE-DERIVED on every transition from priority × workflow class
//     with FLOOR-AT-HIGH for triggers_hse_incident | triggers_change_order |
//     triggers_warranty_claim | contributes_to_evm
//   - URGENT SLA polarity (safety = tightest; construction is hours-money)
//   - ball-in-court tracking + authority tiered
//     (site_supervisor → project_engineer → project_manager → project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_pm_quality_index (0-130 with photo/weather/safety bonuses),
//     days_in_court, predicted_close_date_live, urgency_band,
//     EVM CV/SV/CPI/SPI
//   - SIGNATURE regulator crossings (W97 — OHSA + REIPPPP):
//     submit / approve / void crosses EVERY tier with HSE; approve also
//     EVERY tier when change_order with high+critical; distribute high+
//     critical with change_order; sla_breached high+critical with HSE OR
//     change_order.

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
  | 'drafted' | 'entries_open' | 'entries_closed'
  | 'submitted' | 'under_review'
  | 'returned_for_correction' | 'corrected'
  | 'approved' | 'distributed' | 'archived'
  | 'voided' | 'withdrawn';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'routine_daily' | 'weather_delay' | 'safety_incident' | 'milestone_handover'
  | 'equipment_breakdown' | 'low_productivity' | 'executive_visit' | 'near_miss';

interface DfrRow {
  [key: string]: unknown;
  id: string;
  dfr_number: string;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  owner_party_id: string | null;
  owner_party_name: string | null;
  workflow_class: WorkflowClass;
  priority_class: 'critical' | 'high' | 'standard' | 'low';
  report_date: string;
  shift: string | null;
  site_location: string | null;
  weather_summary: string | null;
  temperature_low_c: number | null;
  temperature_high_c: number | null;
  precipitation_mm: number | null;
  wind_speed_mps: number | null;
  lost_time_hours: number | null;
  weather_delay_minutes: number | null;
  manpower_count: number;
  equipment_count: number;
  photo_count: number;
  entries_count: number;
  weather_log_present: number;
  safety_log_present: number;
  current_tier: Tier;
  authority_required: string | null;
  triggers_hse_incident: number;
  triggers_change_order: number;
  triggers_warranty_claim: number;
  contributes_to_evm: number;
  correction_count: number;
  rejection_count: number;
  evm_pv_zar: number | null;
  evm_ev_zar: number | null;
  evm_ac_zar: number | null;
  parent_dfr_id: string | null;
  hse_incident_ref: string | null;
  change_order_ref: string | null;
  warranty_claim_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  response_text: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  chain_status: ChainStatus;
  drafted_at: string;
  entries_open_at: string | null;
  entries_closed_at: string | null;
  submitted_at: string | null;
  under_review_at: string | null;
  returned_for_correction_at: string | null;
  corrected_at: string | null;
  approved_at: string | null;
  distributed_at: string | null;
  archived_at: string | null;
  voided_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  sla_breached: boolean;
  sla_window_minutes: number;
  urgency_band: 'red' | 'amber' | 'yellow' | 'green' | 'terminal';
  is_reportable_flag: boolean;
  high_tier_flag: boolean;
  floor_at_high_flag: boolean;
  signature_class_flag: boolean;
  authority_required_live: string;
  tier_live: Tier;
  ball_in_court_party_live: string | null;
  days_in_court_live: number;
  days_open_live: number;
  predicted_close_date_live: string | null;
  ipp_pm_quality_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
  evm_cv_zar_live: number;
  evm_sv_zar_live: number;
  evm_cpi_live: number | null;
  evm_spi_live: number | null;
}

interface DfrEvent {
  id: string;
  dfr_id: string;
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
  archived_count: number;
  voided_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  hse_count: number;
  change_order_count: number;
  warranty_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  total_manpower: number;
  total_lost_time_hours: number;
  total_weather_delay_minutes: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'drafted',
  'entries_open',
  'entries_closed',
  'submitted',
  'under_review',
  'corrected',
  'approved',
  'distributed',
  'archived',
];

const BRANCH_STATES: readonly string[] = [
  'returned_for_correction',
  'voided',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                    label: 'Open' },
  { key: 'all',                     label: 'All' },
  { key: 'critical',                label: 'Critical' },
  { key: 'high',                    label: 'High' },
  { key: 'standard',                label: 'Standard' },
  { key: 'low',                     label: 'Low' },
  { key: 'entries_open',            label: 'Entries open' },
  { key: 'under_review',            label: 'Under review' },
  { key: 'returned_for_correction', label: 'Returned' },
  { key: 'approved',                label: 'Approved' },
  { key: 'distributed',             label: 'Distributed' },
  { key: 'archived',                label: 'Archived' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'signature',               label: 'Signature' },
  { key: 'hse_only',                label: 'HSE' },
];

// ── action helpers ────────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['archived', 'voided', 'withdrawn'];

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  routine_daily:        'Routine daily',
  weather_delay:        'Weather delay',
  safety_incident:      'Safety incident',
  milestone_handover:   'Milestone handover',
  equipment_breakdown:  'Equipment breakdown',
  low_productivity:     'Low productivity',
  executive_visit:      'Executive visit',
  near_miss:            'Near miss',
};

const AUTHORITY_LABEL: Record<string, string> = {
  site_supervisor:  'Site supervisor',
  project_engineer: 'Project engineer',
  project_manager:  'Project manager',
  project_director: 'Project director',
};

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const abs = Math.abs(m);
  const sign = m < 0 ? '-' : '';
  if (abs >= 1440) return `${sign}${Math.round(abs / 1440)}d`;
  if (abs >= 60)   return `${sign}${Math.round(abs / 60)}h`;
  return `${sign}${abs}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}R${(a / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (a >= 1000)      return `${sign}R${(a / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `${sign}R${a.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function getActions(row: DfrRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action
  if (s === 'drafted') {
    actions.push({
      key: 'open',
      label: 'Open entries (supervisor)',
      fields: [
        { key: 'title', label: 'DFR title', type: 'text', required: false, placeholder: row.title ?? '' },
      ],
      cascadeTo: [],
    });
  } else if (s === 'entries_open') {
    actions.push({
      key: 'close-entries',
      label: 'Close entries (supervisor)',
      fields: [
        { key: 'notes', label: 'Closing note — what was done today (manpower / equipment / progress)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (s === 'entries_closed' || s === 'corrected') {
    actions.push({
      key: 'submit',
      label: 'Submit (coordinator)',
      fields: [
        { key: 'narrative', label: 'Narrative — describe the construction day (HSE + work fronts + delays)', type: 'textarea', required: true, placeholder: '' },
      ],
      // crosses regulator EVERY tier with HSE
      cascadeTo: row.triggers_hse_incident ? ['regulator'] : [],
    });
  } else if (s === 'submitted') {
    actions.push({
      key: 'start-review',
      label: 'Start review (reviewer)',
      fields: [
        { key: 'last_responder_party', label: 'Reviewer party', type: 'text', required: false, placeholder: 'reviewer' },
      ],
      cascadeTo: [],
    });
  } else if (s === 'under_review') {
    actions.push({
      key: 'approve',
      label: 'Approve (reviewer)',
      fields: [
        { key: 'regulator_ref', label: 'Regulator reference (OHSA/REIPPPP) — leave blank if not reportable', type: 'text', required: false, placeholder: '' },
      ],
      // crosses EVERY tier with HSE or high+critical change_order
      cascadeTo: (row.triggers_hse_incident || row.triggers_change_order) ? ['regulator'] : [],
    });
  } else if (s === 'returned_for_correction') {
    actions.push({
      key: 'correct',
      label: 'Correct (supervisor)',
      fields: [
        { key: 'narrative', label: 'What was corrected', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (s === 'approved') {
    actions.push({
      key: 'distribute',
      label: 'Distribute (coordinator)',
      fields: [
        { key: 'regulator_ref', label: 'Distribution reference (high+critical with change_order crosses regulator)', type: 'text', required: false, placeholder: '' },
      ],
      // distribute high+critical with change_order
      cascadeTo: (row.triggers_change_order && (row.current_tier === 'high' || row.current_tier === 'critical')) ? ['regulator'] : [],
    });
  } else if (s === 'distributed') {
    actions.push({
      key: 'archive',
      label: 'Archive (coordinator)',
      fields: [
        { key: 'notes', label: 'Archive note (optional)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Secondary actions per state
  const secondaryMap: Partial<Record<ChainStatus, ChainStatus[]>> = {
    drafted:                 ['withdrawn'],
    entries_open:            ['withdrawn', 'voided'],
    entries_closed:          ['withdrawn', 'voided'],
    submitted:               ['voided'],
    under_review:            ['returned_for_correction', 'voided'],
    returned_for_correction: ['withdrawn', 'voided'],
    corrected:               ['voided'],
    approved:                ['voided'],
    distributed:             ['voided'],
  };

  // return-for-correction secondary
  if (s === 'under_review') {
    actions.push({
      key: 'return-for-correction',
      label: 'Return for correction (reviewer)',
      fields: [
        { key: 'narrative', label: 'Reason for correction', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // void secondary — crosses regulator EVERY tier with HSE OR change_order
  const voidStates: ChainStatus[] = ['entries_open', 'entries_closed', 'submitted', 'under_review', 'returned_for_correction', 'corrected', 'approved', 'distributed'];
  if (voidStates.includes(s)) {
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with HSE OR change_order crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: (row.triggers_hse_incident || row.triggers_change_order) ? ['regulator'] : [],
    });
  }

  // withdraw secondary
  const withdrawStates: ChainStatus[] = ['drafted', 'entries_open', 'entries_closed', 'returned_for_correction'];
  if (withdrawStates.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (supervisor)',
      fields: [
        { key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Suppress duplicates from secondaryMap approach (we built them explicitly above)
  void secondaryMap;

  return actions;
}

function renderDetail(row: DfrRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live IPP-PM battery */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Live IPP-PM battery</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DetailMetric label="Quality index" value={fmtNum(row.ipp_pm_quality_index_live, 0)} bad={(row.ipp_pm_quality_index_live ?? 0) < 100} hint="0-130 (photo/weather/safety bonuses applied)" />
          <DetailMetric label="Days open" value={String(row.days_open_live ?? 0)} />
          <DetailMetric label="Days in court" value={String(row.days_in_court_live ?? 0)} bad={(row.days_in_court_live ?? 0) > 2} hint="Aging in current state" />
          <DetailMetric label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
          <DetailMetric label="Tier (live)" value={row.tier_live} bad={row.tier_live === 'critical' || row.tier_live === 'high'} hint="Re-derived every transition" />
          <DetailMetric label="Urgency band" value={row.urgency_band} bad={row.urgency_band === 'red' || row.urgency_band === 'amber'} />
          <DetailMetric label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived ETA" />
          <DetailMetric label="Authority" value={authority} hint="Site supervisor → project engineer → project manager → project director" />
        </div>
      </div>

      {/* Coverage flags */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Coverage flags (FLOOR-AT-HIGH)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DetailMetric label="HSE incident" value={row.triggers_hse_incident ? 'Yes' : 'No'} bad={!!row.triggers_hse_incident} hint="OHSA s24 reportable" />
          <DetailMetric label="Change order" value={row.triggers_change_order ? 'Yes' : 'No'} bad={!!row.triggers_change_order} hint="REIPPPP baseline" />
          <DetailMetric label="Warranty claim" value={row.triggers_warranty_claim ? 'Yes' : 'No'} bad={!!row.triggers_warranty_claim} />
          <DetailMetric label="Contributes EVM" value={row.contributes_to_evm ? 'Yes' : 'No'} bad={!!row.contributes_to_evm} />
          <DetailMetric label="Manpower" value={String(row.manpower_count ?? 0)} />
          <DetailMetric label="Equipment" value={String(row.equipment_count ?? 0)} />
          <DetailMetric label="Photos" value={String(row.photo_count ?? 0)} hint="5+ photos = +10 quality" />
          <DetailMetric label="Entries" value={String(row.entries_count ?? 0)} />
          <DetailMetric label="Weather log" value={row.weather_log_present ? 'Yes' : 'No'} hint="+5 quality" />
          <DetailMetric label="Safety log" value={row.safety_log_present ? 'Yes' : 'No'} hint="+5 quality" />
          <DetailMetric label="Lost time" value={row.lost_time_hours != null ? `${fmtNum(row.lost_time_hours)}h` : '—'} bad={(row.lost_time_hours ?? 0) > 0} />
          <DetailMetric label="Weather delay" value={row.weather_delay_minutes != null ? `${row.weather_delay_minutes}m` : '—'} bad={(row.weather_delay_minutes ?? 0) > 0} />
        </div>
      </div>

      {/* EVM */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>EVM (PMI convention)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DetailMetric label="PV (planned)" value={fmtZar(row.evm_pv_zar)} />
          <DetailMetric label="EV (earned)"  value={fmtZar(row.evm_ev_zar)} />
          <DetailMetric label="AC (actual)"  value={fmtZar(row.evm_ac_zar)} />
          <DetailMetric label="CV (EV-AC)"   value={fmtZar(row.evm_cv_zar_live)} bad={(row.evm_cv_zar_live ?? 0) < 0} hint="Cost variance" />
          <DetailMetric label="SV (EV-PV)"   value={fmtZar(row.evm_sv_zar_live)} bad={(row.evm_sv_zar_live ?? 0) < 0} hint="Schedule variance" />
          <DetailMetric label="CPI"          value={fmtNum(row.evm_cpi_live, 2)} bad={(row.evm_cpi_live ?? 1) < 1} hint="Cost performance index (>1 good)" />
          <DetailMetric label="SPI"          value={fmtNum(row.evm_spi_live, 2)} bad={(row.evm_spi_live ?? 1) < 1} hint="Schedule performance index (>1 good)" />
        </div>
      </div>

      {/* Key pairs */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailPair label="Workflow class"   value={WORKFLOW_LABEL[row.workflow_class]} />
        <DetailPair label="Priority"         value={row.priority_class} />
        <DetailPair label="Report date"      value={row.report_date} />
        <DetailPair label="Shift"            value={row.shift ?? '—'} />
        <DetailPair label="Site location"    value={row.site_location ?? '—'} />
        <DetailPair label="Weather"          value={row.weather_summary ?? '—'} />
        <DetailPair label="Temp range (°C)"  value={(row.temperature_low_c != null || row.temperature_high_c != null) ? `${row.temperature_low_c ?? '—'} / ${row.temperature_high_c ?? '—'}` : '—'} />
        <DetailPair label="Precip (mm)"      value={row.precipitation_mm != null ? fmtNum(row.precipitation_mm) : '—'} />
        <DetailPair label="Wind (m/s)"       value={row.wind_speed_mps != null ? fmtNum(row.wind_speed_mps) : '—'} />
        <DetailPair label="Contractor"       value={row.contractor_name ?? '—'} />
        <DetailPair label="Facility"         value={row.facility_name ?? '—'} />
        <DetailPair label="Owner"            value={row.owner_party_name ?? '—'} />
        <DetailPair label="Last responder"   value={row.last_responder_party ?? '—'} />
        <DetailPair label="Requester"        value={row.requester_party ?? '—'} />
        <DetailPair label="Approver"         value={row.approver_party ?? '—'} />
        <DetailPair label="HSE incident ref" value={row.hse_incident_ref ?? '—'} />
        <DetailPair label="Change-order ref" value={row.change_order_ref ?? '—'} />
        <DetailPair label="Warranty ref"     value={row.warranty_claim_ref ?? '—'} />
        <DetailPair label="Regulator ref"    value={row.regulator_ref ?? '—'} />
        <DetailPair label="Corrections"      value={String(row.correction_count ?? 0)} />
        <DetailPair label="Rejections"       value={String(row.rejection_count ?? 0)} />
        <DetailPair label="Drafted"          value={fmtDate(row.drafted_at)} />
        <DetailPair label="Entries open"     value={fmtDate(row.entries_open_at)} />
        <DetailPair label="Entries closed"   value={fmtDate(row.entries_closed_at)} />
        <DetailPair label="Submitted"        value={fmtDate(row.submitted_at)} />
        <DetailPair label="Under review"     value={fmtDate(row.under_review_at)} />
        <DetailPair label="Approved"         value={fmtDate(row.approved_at)} />
        <DetailPair label="Distributed"      value={fmtDate(row.distributed_at)} />
        <DetailPair label="Archived"         value={fmtDate(row.archived_at)} />
        <DetailPair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA"              value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"   value={String(row.escalation_level)} />
        <DetailPair label="Reportable"       value={row.is_reportable_flag ? 'Yes' : 'No'} />
      </div>

      {row.narrative && (
        <div className="col-span-2 mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.narrative}</div>
        </div>
      )}
      {row.response_text && (
        <div className="col-span-2 mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Response</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.response_text}</div>
        </div>
      )}
      {row.voided_reason && (
        <div className="col-span-2 mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Voided reason</div>
          <div className="whitespace-pre-wrap" style={{ color: BAD }}>{row.voided_reason}</div>
        </div>
      )}
      {row.withdrawn_reason && (
        <div className="col-span-2 mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Withdrawn reason</div>
          <div className="whitespace-pre-wrap" style={{ color: WARN }}>{row.withdrawn_reason}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function DfrChainTab() {
  const [rows, setRows] = useState<DfrRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DfrRow[] } & KpiSummary }>('/ipp/dfr/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          archived_count: d.archived_count, voided_count: d.voided_count,
          withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          hse_count: d.hse_count, change_order_count: d.change_order_count,
          warranty_count: d.warranty_count,
          avg_quality_index: d.avg_quality_index,
          avg_days_in_court: d.avg_days_in_court,
          total_manpower: d.total_manpower,
          total_lost_time_hours: d.total_lost_time_hours,
          total_weather_delay_minutes: d.total_weather_delay_minutes,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load daily field reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/dfr/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/dfr/chain/${rowId}`);
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
      const res = await api.get<{ data: { dfr: DfrRow; events: ChainEvent[] } }>(`/ipp/dfr/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'signature')  return r.signature_class_flag;
      if (filter === 'hse_only')   return r.triggers_hse_incident === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, archived_count: 0, voided_count: 0,
    withdrawn_count: 0, breached: 0, reportable_total: 0, signature_count: 0,
    hse_count: 0, change_order_count: 0, warranty_count: 0,
    avg_quality_index: 0, avg_days_in_court: 0, total_manpower: 0,
    total_lost_time_hours: 0, total_weather_delay_minutes: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Daily field report · construction-day record</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 lifecycle for the construction-day side of an IPP project — drafted → entries open →
          entries closed → submitted → under review → approved → distributed → archived, with the
          return-for-correction loop and void / withdraw exception terminals. Beats Procore Daily Log,
          Aconex Daily Site Diary, Buildertrend, Fieldwire, Raken, PlanGrid Daily Field Report and e-Builder
          via: tier RE-DERIVED on every transition; URGENT SLA polarity; ball-in-court tracking; authority
          tiered site_supervisor → project_director; LIVE battery decoration; EVM CV/SV/CPI/SPI.
          SIGNATURE regulator crossings (OHSA s24 + REIPPPP).
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={k.total} />
        <KpiTile label="Open" value={k.open_count} tone={k.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Archived" value={k.archived_count} />
        <KpiTile label="Voided" value={k.voided_count} tone={k.voided_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached" value={k.breached} tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Signature" value={k.signature_count} tone={k.signature_count > 0 ? 'warn' : undefined} />
        <KpiTile label="HSE-bearing" value={k.hse_count} tone={k.hse_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Change-order" value={k.change_order_count} tone={k.change_order_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable" value={k.reportable_total} tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="IPP-PM quality" value={fmtNum(k.avg_quality_index)} />
        <KpiTile label="Manpower (day)" value={k.total_manpower} />
        <KpiTile label="Lost-time hrs" value={fmtNum(k.total_lost_time_hours)} tone={k.total_lost_time_hours > 0 ? 'bad' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>}
      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.dfr_number}${row.title ? ` · ${row.title}` : ''}`}
              meta={`${WORKFLOW_LABEL[row.workflow_class]} · ${row.project_name ?? '—'} · ${row.report_date}${row.current_tier !== 'standard' ? ` · ${row.current_tier}` : ''}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No daily field reports match.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
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

function DetailMetric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div className="text-[12px] font-semibold tabular-nums" style={{ color: bad ? BAD : TX1 }}>{value}</div>
    </div>
  );
}

// Suppress unused import warning — GOOD token is part of the design system
void GOOD;

export default DfrChainTab;
