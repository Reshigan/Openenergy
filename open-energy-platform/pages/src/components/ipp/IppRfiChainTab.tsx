// Wave 116 — IPP RFI (Request For Information) Management chain (P6).
//
// 11th IPP-pure chain. FIFTH Phase-A IPP wave (sibling of W112 schedule,
// W113 EVM, W114 document control, W115 submittals). W112 owns the SCHEDULE;
// W113 owns the COST BOOK; W114 owns the DRAWING REGISTER; W115 owns the
// SUBMITTAL workflow; W116 owns the RFI LIFECYCLE — the rolling contractor →
// engineer → owner_rep question/answer loop where every information request
// can escalate through AIA G716 / FIDIC §1.3 notice channels and feed W117
// change orders downstream.
//
// Beats Procore RFIs / Aconex RFIs / Newforma RFIs / Autodesk Construction
// Cloud RFIs / e-Builder RFIs / Asite RFIs / SmartUse RFIs / Bluebeam Studio
// / Fieldwire RFIs / Bentley AssetWise RFIs.
//
// 12-state forward + 3 branches (rejected, void, escalated) on a P6
// RFI chain with URGENT SLA polarity (HOURS) anchored on submitted:
// emergency_safety 4h, construction_blocking 24h, coordination 72h,
// clarification 168h (higher RFI-criticality = TIGHTEST window).
// FLOOR-AT-EMERGENCY-SAFETY on ANY one of 5 contextual flags
// (safety_hazard_identified, construction_stoppage_in_effect,
// contractor_claim_basis, dispute_basis_referenced,
// regulatory_inquiry_triggered). 4-party split:
// contractor_PM / doc_controller / engineer / owner_rep.
// 20-field LIVE RFI battery. 6-bridge architecture: W114 doc-control,
// W115 submittals, W112 schedule, W113 EVM, W19 procurement, W20 COD.
//
// SIGNATURE Phase-A IPP regulator crossings:
//  * escalate crosses EVERY tier when safety_hazard_identified OR
//    regulatory_inquiry_triggered (W116 SIGNATURE SAFETY-RFI-ESCALATE hard line)
//  * reject crosses EVERY tier when contractor_claim_basis AND
//    cost_impact_zar ≥ R10m
//  * convert_to_change_order crosses construction_blocking +
//    emergency_safety only (W117 auto-link)
//  * link_to_dispute crosses EVERY tier when dispute_basis_referenced
//    AND (claim OR stoppage)
//  * close_out never crosses regulator
//  * SLA breach crosses emergency_safety + construction_blocking only
//
// Standards: CSI 01 31 19 + ISO 19650-2 §5.7 + FIDIC Silver §1.3 +
// AIA G716 + NEC4 §61 + REIPPPP technical-coordination protocol.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'question_drafted' | 'submitted' | 'triage' | 'assigned_to_responder'
  | 'research_in_progress' | 'response_drafted' | 'cross_discipline_review'
  | 'answer_returned' | 'clarification_requested' | 'closed_out' | 'archived'
  | 'rejected' | 'void' | 'escalated';

type IprTier = 'clarification' | 'coordination' | 'construction_blocking' | 'emergency_safety';
type IprUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'contractor_PM' | 'engineer' | 'owner_rep';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';

interface IprRow {
  id: string;
  rfi_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  document_control_ref: string | null;
  submittal_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  linked_change_order_ref: string | null;
  rfi_class: string | null;
  rfi_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  spec_section: string | null;
  csi_section: string | null;
  contractor_name: string | null;
  question_short: string | null;
  question_long: string | null;
  proposed_answer: string | null;
  contractor_pm_name: string | null;
  doc_controller_name: string | null;
  responder_name: string | null;
  responder_party: string | null;
  owner_rep_name: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  safety_hazard_identified: number;
  construction_stoppage_in_effect: number;
  contractor_claim_basis: number;
  dispute_basis_referenced: number;
  regulatory_inquiry_triggered: number;
  stoppage_started_at: string | null;
  cost_impact_zar: number;
  schedule_impact_days: number;
  current_tier: IprTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  rfi_health_band: HealthBand | null;
  rfi_completeness_index: number;
  rfi_age_days: number;
  escalation_count: number;
  regulator_filing_window_hours: number;
  coordination_disciplines: string | null;
  comments_open: number;
  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  escalation_reason: string | null;
  comments_summary: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  question_drafted_at: string | null;
  submitted_at: string | null;
  triage_at: string | null;
  assigned_to_responder_at: string | null;
  research_in_progress_at: string | null;
  response_drafted_at: string | null;
  cross_discipline_review_at: string | null;
  answer_returned_at: string | null;
  clarification_requested_at: string | null;
  closed_out_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  void_at: string | null;
  escalated_at: string | null;
  resumed_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  hash_chain_position: number;
  merkle_root_segment: string | null;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated (LIVE 20-field battery)
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: IprUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  rfi_completeness_index_live?: number;
  rfi_health_band_live?: HealthBand;
  rfi_age_days_live?: number;
  days_construction_blocked_live?: number;
  bridges_to_document_control_chain_live?: boolean;
  bridges_to_submittal_chain_live?: boolean;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
  has_change_order_link_live?: boolean;
}

interface IprEvent {
  id: string;
  rfi_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  question_drafted:        { bg: '#e3e7ec', fg: '#445',    label: 'Question drafted' },
  submitted:               { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  triage:                  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Triage' },
  assigned_to_responder:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Assigned' },
  research_in_progress:    { bg: '#fff4d6', fg: '#a06200', label: 'Research' },
  response_drafted:        { bg: '#fff4d6', fg: '#a06200', label: 'Response drafted' },
  cross_discipline_review: { bg: '#fff4d6', fg: '#a06200', label: 'Cross-discipline' },
  answer_returned:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Answer returned' },
  clarification_requested: { bg: '#fff4d6', fg: '#a06200', label: 'Clarification' },
  closed_out:              { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed out' },
  archived:                { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  rejected:                { bg: '#7a0e0e', fg: '#fff',    label: 'Rejected' },
  void:                    { bg: '#3a3a3a', fg: '#fff',    label: 'Void' },
  escalated:               { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
};

const TIER_TONE: Record<IprTier, { bg: string; fg: string; label: string }> = {
  clarification:         { bg: '#e3e7ec', fg: '#557',    label: 'Clarification' },
  coordination:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Coordination' },
  construction_blocking: { bg: '#fff4d6', fg: '#a06200', label: 'Construction blocking' },
  emergency_safety:      { bg: '#7a0e0e', fg: '#fff',    label: 'Emergency safety' },
};

const URGENCY_TONE: Record<IprUrgency, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

// Row 1: action / lifecycle pills (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'submitted',       label: 'Submitted' },
  { key: 'research',        label: 'Research' },
  { key: 'answered',        label: 'Answered' },
  { key: 'clarification',   label: 'Clarification' },
  { key: 'safety',          label: 'Safety hazard' },
  { key: 'stoppage',        label: 'Stoppage' },
  { key: 'claim',           label: 'Claim basis' },
  { key: 'dispute',         label: 'Dispute' },
  { key: 'regulatory',      label: 'Regulatory' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'question_drafted',        label: 'Drafted' },
  { key: 'triage',                  label: 'Triage' },
  { key: 'assigned_to_responder',   label: 'Assigned' },
  { key: 'research_in_progress',    label: 'Research' },
  { key: 'response_drafted',        label: 'Response drafted' },
  { key: 'cross_discipline_review', label: 'Cross-disc' },
  { key: 'answer_returned',         label: 'Answered' },
  { key: 'clarification_requested', label: 'Clarification req' },
  { key: 'closed_out',              label: 'Closed' },
  { key: 'archived',                label: 'Archived' },
  { key: 'rejected',                label: 'Rejected' },
  { key: 'void',                    label: 'Void' },
  { key: 'escalated',               label: 'Escalated' },
  { key: 'clarification',           label: 'Tier: Clarification' },
  { key: 'coordination',            label: 'Tier: Coordination' },
  { key: 'construction_blocking',   label: 'Tier: Construction-blocking' },
  { key: 'emergency_safety',        label: 'Tier: Emergency-safety' },
];

type ActionKind =
  | 'submit' | 'triage' | 'assign-responder' | 'commence-research'
  | 'draft-response' | 'coordinate-review' | 'return-answer'
  | 'request-clarification' | 'close-out' | 'archive'
  | 'reject' | 'void' | 'escalate'
  | 'convert-to-change-order' | 'link-to-dispute';

const ACTION_FOR_STATE: Partial<Record<ChainStatus, ActionKind>> = {
  question_drafted:        'submit',
  submitted:               'triage',
  triage:                  'assign-responder',
  assigned_to_responder:   'commence-research',
  research_in_progress:    'draft-response',
  response_drafted:        'coordinate-review',
  cross_discipline_review: 'return-answer',
  answer_returned:         'close-out',
  clarification_requested: 'commence-research',
  closed_out:              'archive',
  escalated:               'commence-research',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit':                  'Submit (Contractor PM — anchors URGENT SLA)',
  'triage':                  'Triage (Doc Controller)',
  'assign-responder':        'Assign responder (Doc Controller)',
  'commence-research':       'Commence research (Engineer)',
  'draft-response':          'Draft response (Engineer)',
  'coordinate-review':       'Cross-discipline review (Engineer)',
  'return-answer':           'Return answer (Engineer)',
  'request-clarification':   'Request clarification (Engineer — loops to research)',
  'close-out':               'Close out (Owner Rep)',
  'archive':                 'Archive (Owner Rep — HARD terminal)',
  'reject':                  'Reject (Owner Rep — SIGNATURE: crosses regulator EVERY tier when claim AND cost ≥ R10m)',
  'void':                    'Void (Contractor PM — issuer pull, pre-triage only)',
  'escalate':                'Escalate (Owner Rep — SIGNATURE SAFETY-RFI-ESCALATE: crosses regulator EVERY tier when safety hazard OR regulatory inquiry)',
  'convert-to-change-order': 'Convert to change order (Engineer — W117 link; construction_blocking + emergency_safety only)',
  'link-to-dispute':         'Link to dispute (Contractor PM — crosses EVERY tier when dispute basis AND claim/stoppage)',
};

function fmtHoursSla(h: number | null | undefined): string {
  if (h === null || h === undefined) return '-';
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  if (abs >= 24) return `${sign}${(abs / 24).toFixed(1)}d`;
  if (abs >= 1)  return `${sign}${abs.toFixed(1)}h`;
  return `${sign}${Math.round(abs * 60)}m`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(0)} MW`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return '-';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

interface KpiSummary {
  total: number;
  active_count: number;
  drafted_count: number;
  submitted_count: number;
  triage_count: number;
  assigned_count: number;
  research_count: number;
  answered_count: number;
  clarification_count: number;
  closed_out_count: number;
  archived_count: number;
  rejected_count: number;
  void_count: number;
  escalated_count: number;
  emergency_safety_count: number;
  breached: number;
  reportable_total: number;
  safety_count: number;
  stoppage_count: number;
  claim_count: number;
  dispute_count: number;
  regulatory_count: number;
  document_control_bridged_count: number;
  submittal_bridged_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  cod_bridged_count: number;
  change_order_linked_count: number;
  completeness_avg: number;
  cost_impact_zar_total: number;
  schedule_impact_days_total: number;
}

export function IppRfiChainTab() {
  const [rows, setRows] = useState<IprRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<IprRow | null>(null);
  const [events, setEvents] = useState<IprEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IprRow[] } & KpiSummary }>('/ipp/rfis/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          drafted_count: data.drafted_count || 0,
          submitted_count: data.submitted_count || 0,
          triage_count: data.triage_count || 0,
          assigned_count: data.assigned_count || 0,
          research_count: data.research_count || 0,
          answered_count: data.answered_count || 0,
          clarification_count: data.clarification_count || 0,
          closed_out_count: data.closed_out_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          void_count: data.void_count || 0,
          escalated_count: data.escalated_count || 0,
          emergency_safety_count: data.emergency_safety_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          safety_count: data.safety_count || 0,
          stoppage_count: data.stoppage_count || 0,
          claim_count: data.claim_count || 0,
          dispute_count: data.dispute_count || 0,
          regulatory_count: data.regulatory_count || 0,
          document_control_bridged_count: data.document_control_bridged_count || 0,
          submittal_bridged_count: data.submittal_bridged_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          change_order_linked_count: data.change_order_linked_count || 0,
          completeness_avg: data.completeness_avg || 0,
          cost_impact_zar_total: data.cost_impact_zar_total || 0,
          schedule_impact_days_total: data.schedule_impact_days_total || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP RFI chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: IprRow; events: IprEvent[] } }>(`/ipp/rfis/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'research')        return (
        r.chain_status === 'research_in_progress' ||
        r.chain_status === 'response_drafted' ||
        r.chain_status === 'cross_discipline_review'
      );
      if (filter === 'answered')        return r.chain_status === 'answer_returned';
      if (filter === 'clarification')   return r.chain_status === 'clarification_requested';
      if (filter === 'safety')          return !!r.safety_hazard_identified;
      if (filter === 'stoppage')        return !!r.construction_stoppage_in_effect;
      if (filter === 'claim')           return !!r.contractor_claim_basis;
      if (filter === 'dispute')         return !!r.dispute_basis_referenced;
      if (filter === 'regulatory')      return !!r.regulatory_inquiry_triggered;
      if (filter === 'health_red')      return r.rfi_health_band_live === 'red';
      if (filter === 'health_critical') return r.rfi_health_band_live === 'critical';
      if (['clarification', 'coordination', 'construction_blocking', 'emergency_safety'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, drafted_count: 0, submitted_count: 0,
    triage_count: 0, assigned_count: 0, research_count: 0, answered_count: 0,
    clarification_count: 0, closed_out_count: 0, archived_count: 0,
    rejected_count: 0, void_count: 0, escalated_count: 0,
    emergency_safety_count: 0, breached: 0, reportable_total: 0,
    safety_count: 0, stoppage_count: 0, claim_count: 0, dispute_count: 0,
    regulatory_count: 0, document_control_bridged_count: 0,
    submittal_bridged_count: 0, schedule_bridged_count: 0,
    evm_bridged_count: 0, procurement_bridged_count: 0, cod_bridged_count: 0,
    change_order_linked_count: 0, completeness_avg: 0,
    cost_impact_zar_total: 0, schedule_impact_days_total: 0,
  };

  const act = useCallback(async (action: ActionKind, row: IprRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'submit') {
        const cls = window.prompt('RFI class (clarification / coordination / construction_blocking / emergency_safety):', row.rfi_class ?? '');
        if (cls) body.rfi_class = cls;
        const short = window.prompt('Question short (1-line summary):', row.question_short ?? '');
        if (short) body.question_short = short;
      } else if (action === 'triage') {
        const ctrl = window.prompt('Doc Controller name:', row.doc_controller_name ?? '');
        if (ctrl) body.doc_controller_name = ctrl;
      } else if (action === 'assign-responder') {
        const name = window.prompt('Responder name (Engineer):', row.responder_name ?? '');
        if (name) body.responder_name = name;
        const party = window.prompt('Responder party (engineer / IE / SHEQ):', row.responder_party ?? 'engineer');
        if (party) body.responder_party = party;
      } else if (action === 'commence-research') {
        const note = window.prompt('Research start note (Engineer):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'draft-response') {
        const proposed = window.prompt('Proposed answer (drafted by responder):', row.proposed_answer ?? '');
        if (!proposed) return;
        body.proposed_answer = proposed;
      } else if (action === 'coordinate-review') {
        const disc = window.prompt('Coordination disciplines (comma-separated, e.g. civil,mechanical,electrical):', row.coordination_disciplines ?? '');
        if (disc) body.coordination_disciplines = disc;
      } else if (action === 'return-answer') {
        const summaryText = window.prompt('Answer summary (returned to Contractor PM):', row.comments_summary ?? '');
        if (summaryText !== null) body.comments_summary = summaryText;
      } else if (action === 'request-clarification') {
        const reason = window.prompt('Clarification request reason (loops back to research, +1 cycle):', row.reason_code ?? '');
        if (!reason) return;
        body.reason_code = reason;
      } else if (action === 'close-out') {
        const ownerRep = window.prompt('Owner Rep name (closes out the RFI):', row.owner_rep_name ?? '');
        if (ownerRep) body.owner_rep_name = ownerRep;
      } else if (action === 'archive') {
        const note = window.prompt('Archive note (Owner Rep — HARD terminal, never crosses regulator):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject') {
        const reason = window.prompt('Reject reason (required). NOTE: W116 SIGNATURE — crosses regulator EVERY tier when contractor_claim_basis AND cost_impact_zar ≥ R10m.', row.reject_reason ?? '');
        if (!reason) return;
        body.reject_reason = reason;
      } else if (action === 'void') {
        const reason = window.prompt('Void reason (issuer pull, pre-triage only):', row.void_reason ?? '');
        if (!reason) return;
        body.void_reason = reason;
      } else if (action === 'escalate') {
        const reason = window.prompt('Escalation reason. NOTE: W116 SIGNATURE SAFETY-RFI-ESCALATE — crosses regulator EVERY tier when safety_hazard_identified OR regulatory_inquiry_triggered.', row.escalation_reason ?? '');
        if (!reason) return;
        body.escalation_reason = reason;
      } else if (action === 'convert-to-change-order') {
        const ref = window.prompt('Linked Change-Order reference (W117 link). NOTE: construction_blocking + emergency_safety only.', row.linked_change_order_ref ?? '');
        if (!ref) return;
        body.linked_change_order_ref = ref;
      } else if (action === 'link-to-dispute') {
        const reason = window.prompt('Dispute basis (Contractor PM). NOTE: crosses regulator EVERY tier when dispute_basis_referenced AND (claim || stoppage).', row.reason_code ?? '');
        if (!reason) return;
        body.reason_code = reason;
      }
      await api.post(`/ipp/rfis/chain/${row.id}/${action}`, body);
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
            IPP RFI Lifecycle &mdash; CSI 01 31 19 + ISO 19650-2 {'§5.7'} + FIDIC Silver {'§1.3'} + AIA G716 + NEC4 {'§61'} + REIPPPP technical-coord
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 RFI chain:
            question drafted {'→'} submitted {'→'} triage {'→'} assigned to responder {'→'} research {'→'} response drafted {'→'}
            cross-discipline review {'→'} answer returned {'→'} clarification requested (loops to research) {'→'} closed out {'→'} archived,
            with rejected (terminal) / void (terminal, pre-triage pull) / escalated (soft) branches.
            URGENT SLA polarity (HOURS) on submitted: emergency_safety 4h, construction_blocking 24h, coordination 72h, clarification 168h
            (<em>higher RFI-criticality gets TIGHTEST window</em>). FLOOR-AT-EMERGENCY-SAFETY on ANY one of 5 contextual flags
            (safety hazard, construction stoppage, contractor claim, dispute basis, regulatory inquiry). SIGNATURE:
            <strong> escalate crosses regulator EVERY tier when safety_hazard_identified OR regulatory_inquiry_triggered</strong>
            (W116 SAFETY-RFI-ESCALATE hard line); reject crosses EVERY tier when contractor_claim_basis AND cost_impact_zar {'≥'} R10m;
            convert_to_change_order crosses construction_blocking + emergency_safety; link_to_dispute crosses EVERY tier when dispute_basis AND (claim || stoppage);
            close_out never crosses regulator; SLA breach crosses emergency_safety + construction_blocking only. 4-party split:
            contractor_PM {'→'} doc_controller {'→'} engineer {'→'} owner_rep. 6 bridges: W114 doc-control, W115 submittals, W112 schedule, W113 EVM, W19 procurement, W20 COD.
            Nightly aging refresh at 00:35 UTC keeps rfi_age_days / completeness / health-band live.
          </p>
        </div>
      </header>

      {/* 8-card KPI strip — action-LEFT (most actionable first) */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Active"           value={kpis.active_count}           tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Submitted"        value={kpis.submitted_count}        tone={kpis.submitted_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Research"         value={kpis.research_count}         tone={kpis.research_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Answered"         value={kpis.answered_count}         tone={kpis.answered_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Safety"           value={kpis.safety_count}           tone={kpis.safety_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"     value={kpis.breached}               tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Emergency safety" value={kpis.emergency_safety_count} tone={kpis.emergency_safety_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Total"            value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Drafted: <span className="font-semibold text-[#445]">{kpis.drafted_count}</span></span>
        <span>Triage: <span className="font-semibold text-[#1a3a5c]">{kpis.triage_count}</span></span>
        <span>Assigned: <span className="font-semibold text-[#1a3a5c]">{kpis.assigned_count}</span></span>
        <span>Clarification: <span className="font-semibold text-[#a06200]">{kpis.clarification_count}</span></span>
        <span>Closed: <span className="font-semibold text-[#1f5b3a]">{kpis.closed_out_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Rejected: <span className="font-semibold text-[#9b1f1f]">{kpis.rejected_count}</span></span>
        <span>Void: <span className="font-semibold text-[#6b7685]">{kpis.void_count}</span></span>
        <span>Escalated: <span className="font-semibold text-[#9b1f1f]">{kpis.escalated_count}</span></span>
        <span>Stoppage: <span className="font-semibold text-[#9b1f1f]">{kpis.stoppage_count}</span></span>
        <span>Claim: <span className="font-semibold text-[#a06200]">{kpis.claim_count}</span></span>
        <span>Dispute: <span className="font-semibold text-[#9b1f1f]">{kpis.dispute_count}</span></span>
        <span>Regulatory: <span className="font-semibold text-[#9b1f1f]">{kpis.regulatory_count}</span></span>
        <span>CO linked: <span className="font-semibold text-[#1a3a5c]">{kpis.change_order_linked_count}</span></span>
        <span>Completeness avg: <span className="font-semibold text-[#1a3a5c]">{kpis.completeness_avg}/130</span></span>
        <span>Cost impact: <span className="font-semibold text-[#9b1f1f]">{fmtZar(kpis.cost_impact_zar_total)}</span></span>
        <span>Sched days: <span className="font-semibold text-[#a06200]">{kpis.schedule_impact_days_total}</span></span>
        <span>W114 (doc): <span className="font-semibold text-[#1a3a5c]">{kpis.document_control_bridged_count}</span></span>
        <span>W115 (sub): <span className="font-semibold text-[#1a3a5c]">{kpis.submittal_bridged_count}</span></span>
        <span>W112 (sch): <span className="font-semibold text-[#1a3a5c]">{kpis.schedule_bridged_count}</span></span>
        <span>W113 (EVM): <span className="font-semibold text-[#1a3a5c]">{kpis.evm_bridged_count}</span></span>
        <span>W19 (proc): <span className="font-semibold text-[#1a3a5c]">{kpis.procurement_bridged_count}</span></span>
        <span>W20 (COD): <span className="font-semibold text-[#1a3a5c]">{kpis.cod_bridged_count}</span></span>
      </div>

      {/* Row 1: action / lifecycle pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button
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

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#1a3a5c] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">RFI #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Question</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Age (d)</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Cost impact</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Completeness</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const urgency = URGENCY_TONE[r.urgency_band_live ?? 'low'];
                const health = HEALTH_TONE[r.rfi_health_band_live ?? 'green'];
                const compl = r.rfi_completeness_index_live ?? r.rfi_completeness_index ?? 0;
                const ageDays = r.rfi_age_days_live ?? r.rfi_age_days ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.rfi_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="text-[11px] font-medium">{r.project_name ?? r.project_id}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {fmtMw(r.project_capacity_mw)}
                        {r.safety_hazard_identified ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">SFTY</span> : null}
                        {r.construction_stoppage_in_effect ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">STOP</span> : null}
                        {r.contractor_claim_basis ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">CLM</span> : null}
                        {r.dispute_basis_referenced ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">DSP</span> : null}
                        {r.regulatory_inquiry_triggered ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.package_code ?? r.csi_section ?? '-'}</div>
                      <div className="text-[10px] text-[#6b7685] truncate max-w-[260px]">{r.question_short ?? r.title ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[#1a3a5c]">
                      <span className={ageDays >= 14 ? 'font-bold text-[#9b1f1f]' : ageDays >= 7 ? 'font-bold text-[#a06200]' : ''}>{ageDays}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: health.bg, color: health.fg }}>
                        {health.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: urgency.bg, color: urgency.fg }}>
                        {urgency.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.cost_impact_zar >= 10_000_000 ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>
                      {fmtZar(r.cost_impact_zar)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${compl >= 90 ? 'text-[#1f5b3a]' : compl >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f]'}`}>
                      {compl}/130
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No RFIs match.</td></tr>
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
  row: IprRow;
  events: IprEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: IprRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const completeness = row.rfi_completeness_index_live ?? row.rfi_completeness_index;

  // Overflow actions allowed across non-terminal states.
  const canRequestClarification: ChainStatus[] = ['answer_returned', 'response_drafted', 'cross_discipline_review'];
  const canConvertToChangeOrder: ChainStatus[] = ['research_in_progress', 'response_drafted', 'cross_discipline_review', 'answer_returned'];
  const canLinkToDispute: ChainStatus[] = [
    'submitted', 'triage', 'assigned_to_responder', 'research_in_progress',
    'response_drafted', 'cross_discipline_review', 'answer_returned',
    'clarification_requested', 'escalated',
  ];
  const canEscalate: ChainStatus[] = [
    'submitted', 'triage', 'assigned_to_responder', 'research_in_progress',
    'response_drafted', 'cross_discipline_review', 'answer_returned',
    'clarification_requested',
  ];
  const canReject: ChainStatus[] = [
    'question_drafted', 'submitted', 'triage', 'assigned_to_responder',
    'research_in_progress', 'response_drafted', 'cross_discipline_review',
    'answer_returned', 'clarification_requested', 'escalated',
  ];
  const canVoid: ChainStatus[] = [
    'question_drafted', 'submitted',
  ];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[896px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.rfi_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? row.project_id} &mdash; {fmtMw(row.project_capacity_mw)}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} Class <span className="font-mono text-[#1a3a5c]">{row.rfi_class ?? '-'}</span>
                {' '}{'•'} Age <span className="font-mono text-[#1a3a5c]">{row.rfi_age_days_live ?? row.rfi_age_days}d</span>
                {' '}{'•'} Escalations <span className="font-mono text-[#1a3a5c]">{row.escalation_count}</span>
                {' '}{'•'} Completeness <span className="text-[#1a3a5c]">{completeness}/130</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded border border-[#d8dde6] bg-white px-2 py-1 text-[12px] text-[#445] hover:bg-[#f3f5f9]"
            >
              Close
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: STATE_TONE[row.chain_status].bg, color: STATE_TONE[row.chain_status].fg }}>
              {STATE_TONE[row.chain_status].label}
            </span>
            {row.urgency_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: URGENCY_TONE[row.urgency_band_live].bg, color: URGENCY_TONE[row.urgency_band_live].fg }}>
                {URGENCY_TONE[row.urgency_band_live].label}
              </span>
            )}
            {row.rfi_health_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: HEALTH_TONE[row.rfi_health_band_live].bg, color: HEALTH_TONE[row.rfi_health_band_live].fg }}>
                Health: {HEALTH_TONE[row.rfi_health_band_live].label}
              </span>
            )}
            {row.authority_required_live && (
              <span className="inline-block rounded border border-[#d8dde6] bg-white px-2 py-0.5 text-[#445]">
                Authority: {row.authority_required_live.replace(/_/g, ' ')}
              </span>
            )}
            {row.is_reportable_flag && (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">Reportable</span>
            )}
            {row.regulator_crossed_at && (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Regulator crossed</span>
            )}
            {row.safety_hazard_identified ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Safety hazard</span>
            ) : null}
            {row.construction_stoppage_in_effect ? (
              <span className="inline-block rounded bg-[#9b1f1f] px-2 py-0.5 font-semibold text-white">Construction stoppage</span>
            ) : null}
            {row.regulatory_inquiry_triggered ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Regulatory inquiry</span>
            ) : null}
            {row.has_change_order_link_live ? (
              <span className="inline-block rounded bg-[#1a3a5c] px-2 py-0.5 font-semibold text-white">W117 CO linked</span>
            ) : null}
          </div>
        </header>

        <div className="p-5 space-y-4">
          {/* LIVE 20-field battery */}
          <Section title="LIVE battery (20 fields, re-computed every fetch)">
            <Grid>
              <Field label="Tier (re-derived)"          value={TIER_TONE[row.current_tier].label} tone={row.current_tier === 'emergency_safety' ? 'bad' : row.current_tier === 'construction_blocking' ? 'warn' : 'ok'} />
              <Field label="Floor flags"                value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 1 ? 'bad' : 'ok'} />
              <Field label="Authority required"         value={row.authority_required_live ?? '-'} />
              <Field label="Completeness"               value={`${completeness} / 130`} tone={completeness >= 90 ? 'ok' : completeness >= 60 ? 'warn' : 'bad'} />
              <Field label="Health band"                value={row.rfi_health_band_live ?? '-'} />
              <Field label="Urgency"                    value={row.urgency_band_live ?? '-'} />
              <Field label="SLA hours remaining"        value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"                 value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Regulator filing window"    value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
              <Field label="RFI age (live)"             value={`${row.rfi_age_days_live ?? row.rfi_age_days}d`} tone={(row.rfi_age_days_live ?? row.rfi_age_days) >= 14 ? 'bad' : (row.rfi_age_days_live ?? row.rfi_age_days) >= 7 ? 'warn' : 'ok'} />
              <Field label="Days blocked"               value={`${row.days_construction_blocked_live ?? 0}d`} tone={(row.days_construction_blocked_live || 0) > 0 ? 'bad' : 'ok'} />
              <Field label="Escalations"                value={String(row.escalation_count)} tone={row.escalation_count >= 1 ? 'warn' : 'ok'} />
              <Field label="Comments open"              value={String(row.comments_open)} tone={row.comments_open > 0 ? 'warn' : 'ok'} />
              <Field label="Cost impact"                value={fmtZar(row.cost_impact_zar)} tone={row.cost_impact_zar >= 10_000_000 ? 'bad' : row.cost_impact_zar > 0 ? 'warn' : 'ok'} />
              <Field label="Schedule impact (d)"        value={`${row.schedule_impact_days}d`} tone={row.schedule_impact_days >= 7 ? 'bad' : row.schedule_impact_days > 0 ? 'warn' : 'ok'} />
              <Field label="Hash chain position"        value={String(row.hash_chain_position)} />
              <Field label="Merkle segment (W118)"      value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
              <Field label="W117 CO link"               value={row.linked_change_order_ref ?? '-'} tone={row.has_change_order_link_live ? 'ok' : 'warn'} />
              <Field label="Last responder"             value={row.last_responder_party ?? '-'} />
              <Field label="Ball-in-court"              value={row.current_ball_in_court_party ?? '-'} />
            </Grid>
          </Section>

          {/* RFI identity (CSI 01 31 19 + AIA G716) */}
          <Section title="RFI identity (CSI 01 31 19 + AIA G716 + ISO 19650-2 §5.7)">
            <Grid>
              <Field label="RFI class"           value={row.rfi_class ?? '-'} />
              <Field label="RFI type"            value={row.rfi_type ?? '-'} />
              <Field label="Discipline"          value={row.discipline ?? '-'} />
              <Field label="Package code"        value={row.package_code ?? '-'} />
              <Field label="CSI section"         value={row.csi_section ?? '-'} />
              <Field label="Spec section"        value={row.spec_section ?? '-'} />
              <Field label="Drawing number"      value={row.drawing_number ?? '-'} />
              <Field label="Contractor"          value={row.contractor_name ?? '-'} />
              <Field label="Contractor PM"       value={row.contractor_pm_name ?? '-'} />
              <Field label="Doc Controller"      value={row.doc_controller_name ?? '-'} />
              <Field label="Responder"           value={row.responder_name ?? '-'} />
              <Field label="Responder party"     value={row.responder_party ?? '-'} />
              <Field label="Owner Rep"           value={row.owner_rep_name ?? '-'} />
              <Field label="Coord disciplines"   value={row.coordination_disciplines ?? '-'} />
            </Grid>
          </Section>

          {/* Bridges */}
          <Section title="6-bridge architecture (W114 / W115 / W112 / W113 / W19 / W20)">
            <Grid>
              <Field label="W114 doc-control ref" value={row.document_control_ref ?? '-'} tone={row.bridges_to_document_control_chain_live ? 'ok' : 'warn'} />
              <Field label="W115 submittal ref"   value={row.submittal_ref ?? '-'}        tone={row.bridges_to_submittal_chain_live ? 'ok' : 'warn'} />
              <Field label="W112 schedule ref"    value={row.schedule_ref ?? '-'}         tone={row.bridges_to_schedule_chain_live ? 'ok' : 'warn'} />
              <Field label="W113 EVM ref"         value={row.evm_ref ?? '-'}              tone={row.bridges_to_evm_chain_live ? 'ok' : 'warn'} />
              <Field label="W19 procurement ref"  value={row.procurement_ref ?? '-'}      tone={row.bridges_to_procurement_chain_live ? 'ok' : 'warn'} />
              <Field label="W20 COD ref"          value={row.cod_ref ?? '-'}              tone={row.bridges_to_cod_chain_live ? 'ok' : 'warn'} />
              <Field label="W117 CO ref"          value={row.linked_change_order_ref ?? '-'} tone={row.has_change_order_link_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"  value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"        value={row.regulator_ref ?? '-'} />
              <Field label="Stoppage started at"  value={fmtDate(row.stoppage_started_at)} tone={row.construction_stoppage_in_effect ? 'bad' : 'ok'} />
            </Grid>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5) — ANY one triggers FLOOR-AT-EMERGENCY-SAFETY">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="Safety hazard"           on={!!row.safety_hazard_identified} />
              <FlagPill label="Construction stoppage"   on={!!row.construction_stoppage_in_effect} />
              <FlagPill label="Contractor claim basis"  on={!!row.contractor_claim_basis} />
              <FlagPill label="Dispute basis"           on={!!row.dispute_basis_referenced} />
              <FlagPill label="Regulatory inquiry"      on={!!row.regulatory_inquiry_triggered} />
            </div>
          </Section>

          {/* Question */}
          {(row.question_short || row.question_long || row.proposed_answer) && (
            <Section title="Question / answer">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.question_short && <div><strong>Short:</strong> {row.question_short}</div>}
                {row.question_long && <div><strong>Long:</strong> {row.question_long}</div>}
                {row.proposed_answer && <div><strong>Proposed answer:</strong> {row.proposed_answer}</div>}
              </div>
            </Section>
          )}

          {/* Reasons */}
          {(row.reject_reason || row.void_reason || row.escalation_reason || row.comments_summary || row.reason_code) && (
            <Section title="Reasons / narrative">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.reason_code && <div><strong>Reason code:</strong> {row.reason_code}</div>}
                {row.reject_reason && <div><strong>Reject reason:</strong> {row.reject_reason}</div>}
                {row.void_reason && <div><strong>Void reason:</strong> {row.void_reason}</div>}
                {row.escalation_reason && <div><strong>Escalation reason:</strong> {row.escalation_reason}</div>}
                {row.comments_summary && <div><strong>Comments summary:</strong> {row.comments_summary}</div>}
              </div>
            </Section>
          )}

          {/* Action ladder — primary + overflow */}
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <ActionButton tone="primary" onClick={() => onAct(nextAction, row)}>
                  {ACTION_LABEL[nextAction]}
                </ActionButton>
              )}
              {canRequestClarification.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('request-clarification', row)}>
                  {ACTION_LABEL['request-clarification']}
                </ActionButton>
              )}
              {canConvertToChangeOrder.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('convert-to-change-order', row)}>
                  {ACTION_LABEL['convert-to-change-order']}
                </ActionButton>
              )}
              {canLinkToDispute.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('link-to-dispute', row)}>
                  {ACTION_LABEL['link-to-dispute']}
                </ActionButton>
              )}
              {canEscalate.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('escalate', row)}>
                  {ACTION_LABEL['escalate']}
                </ActionButton>
              )}
              {canReject.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('reject', row)}>
                  {ACTION_LABEL['reject']}
                </ActionButton>
              )}
              {canVoid.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('void', row)}>
                  {ACTION_LABEL['void']}
                </ActionButton>
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section title={`Timeline (${events.length} events)`}>
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.id} className="flex items-baseline gap-3 border-b border-[#e3e7ec] py-1 text-[11px]">
                  <span className="font-mono text-[#6b7685]">{fmtDate(e.created_at)}</span>
                  <span className="font-semibold text-[#1a3a5c]">{e.event_type}</span>
                  {e.from_status && e.to_status && (
                    <span className="text-[#4a5568]">{e.from_status} {'→'} {e.to_status}</span>
                  )}
                  {e.actor_party && <span className="text-[#6b7685]">[{e.actor_party}]</span>}
                  {e.notes && <span className="text-[#4a5568] truncate">{e.notes}</span>}
                </div>
              ))}
              {events.length === 0 && <div className="text-[12px] text-[#6b7685]">No events yet.</div>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#1a3a5c]">{title}</h3>
      <div className="rounded border border-[#d8dde6] bg-[#fafbfd] p-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>;
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#1a3a5c';
  return (
    <div className="rounded border border-[#e3e7ec] bg-white px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[12px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function FlagPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 font-medium ${on ? 'bg-[#fde0e0] text-[#9b1f1f]' : 'bg-[#e3e7ec] text-[#6b7685]'}`}>
      {label}{on ? ' ✓' : ''}
    </span>
  );
}

function ActionButton({
  children, onClick, tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'primary' | 'warn' | 'danger';
}) {
  const bg = tone === 'danger' ? '#7a0e0e' : tone === 'warn' ? '#a06200' : '#1a3a5c';
  return (
    <button
      onClick={onClick}
      className="rounded px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
      style={{ background: bg }}
    >
      {children}
    </button>
  );
}
