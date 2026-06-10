// Wave 115 — IPP Submittal / Transmittal Lifecycle chain (P6).
//
// 10th IPP chain. FOURTH Phase-A IPP wave (sibling of W112 schedule,
// W113 EVM, W114 document control). W112 owns the SCHEDULE; W113 owns
// the COST BOOK; W114 owns the DRAWING REGISTER; W115 owns the
// SUBMITTAL / TRANSMITTAL workflow — the rolling contractor → engineer
// → owner_rep delivery loop where every package can cycle through
// CSI 01 33 00 stamps A/B/C/D/E.
//
// Beats Procore Submittals / Aconex Workflows / Newforma Transmittals /
// Autodesk Construction Cloud Submittals / e-Builder Submittals / Asite
// Workflows / Oracle CCS Submittals / Coreworx EDMS / SmartUse Submittals.
//
// 12-state forward + 3 branches (rejected, void, escalated) on a P6
// submittal chain with URGENT SLA polarity (HOURS) anchored on submitted:
// critical_safety 24h, shop_drawing 168h, material_approval 240h,
// om_manual 480h (higher submittal-criticality = TIGHTEST window).
// FLOOR-AT-CRITICAL-SAFETY on ANY one of 5 flags (long_lead_item,
// commissioning_critical, regulatory_witness_required,
// lender_information_covenant, dispute_history). 3-step authority ladder:
// contractor_PM → engineer → owner_rep. 20-field LIVE submittal battery.
// 6-bridge architecture: W114 doc-control, W112 schedule, W113 EVM,
// W19 procurement, W23 insurance, W20 COD.
//
// SIGNATURE Phase-A IPP regulator crossings:
//  * stamp_return crosses EVERY tier when stamp_code='E' AND
//    (critical_safety OR commissioning_critical)
//    (W115 SIGNATURE STAMP-E-REJECT-CRITICAL hard line)
//  * reject crosses EVERY tier when long_lead_item AND cycle_count >= 3
//  * escalate crosses critical_safety + material_approval only when
//    regulatory_witness_required
//  * close_out never crosses regulator
//  * sla_breached crosses critical_safety + shop_drawing (heavy tiers)
//
// Standards: ISO 19650-2 §5.7 (information delivery workflows) +
// CSI 01 33 00 (Submittal Procedures — STAMPS A/B/C/D/E) +
// FIDIC Silver Book §6 (engineer review) + NEC4 §54 (contractor
// information) + REIPPPP Schedule 4 (submittal protocol) +
// DMRE EPC submittal requirements.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'contractor_drafted' | 'package_assembled' | 'submitted' | 'screening'
  | 'assigned_to_reviewer' | 'under_review' | 'coordination_review'
  | 'response_drafted' | 'stamped_returned' | 'resubmission_requested'
  | 'closed_out' | 'archived'
  | 'rejected' | 'void' | 'escalated';

type IpsTier = 'om_manual' | 'material_approval' | 'shop_drawing' | 'critical_safety';
type IpsUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'contractor_PM' | 'engineer' | 'owner_rep';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type StampCode = 'A' | 'B' | 'C' | 'D' | 'E';

interface IpsRow {
  id: string;
  submittal_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  document_control_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  insurance_ref: string | null;
  cod_ref: string | null;
  submittal_class: string | null;
  submittal_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  drawing_title: string | null;
  csi_section: string | null;
  contractor_name: string | null;
  supplier_name: string | null;
  stamp_code: StampCode | null;
  cycle_count: number;
  last_transmittal_number: string | null;
  last_transmittal_at: string | null;
  contractor_pm_name: string | null;
  doc_controller_name: string | null;
  reviewer_name: string | null;
  reviewer_party: string | null;
  owner_rep_name: string | null;
  long_lead_item: number;
  commissioning_critical: number;
  regulatory_witness_required: number;
  lender_information_covenant: number;
  dispute_history: number;
  long_lead_deadline_at: string | null;
  current_tier: IpsTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  submittal_health_band: HealthBand | null;
  submittal_completeness_index: number;
  regulatory_witness_window_hours: number;
  coordination_disciplines: string | null;
  comments_open: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  escalation_reason: string | null;
  comments_summary: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  contractor_drafted_at: string | null;
  package_assembled_at: string | null;
  submitted_at: string | null;
  screening_at: string | null;
  assigned_to_reviewer_at: string | null;
  under_review_at: string | null;
  coordination_review_at: string | null;
  response_drafted_at: string | null;
  stamped_returned_at: string | null;
  resubmission_requested_at: string | null;
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
  urgency_band_live?: IpsUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  regulatory_witness_window_hours_live?: number;
  floor_flag_count_live?: number;
  submittal_completeness_index_live?: number;
  submittal_health_band_live?: HealthBand;
  days_to_long_lead_deadline_live?: number | null;
  bridges_to_document_control_chain_live?: boolean;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_insurance_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
}

interface IpsEvent {
  id: string;
  submittal_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  stamp_code: string | null;
  cycle_count: number | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  contractor_drafted:     { bg: '#e3e7ec', fg: '#445',    label: 'Contractor drafted' },
  package_assembled:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Package assembled' },
  submitted:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  screening:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Screening' },
  assigned_to_reviewer:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Assigned' },
  under_review:           { bg: '#fff4d6', fg: '#a06200', label: 'Under review' },
  coordination_review:    { bg: '#fff4d6', fg: '#a06200', label: 'Coordination review' },
  response_drafted:       { bg: '#fff4d6', fg: '#a06200', label: 'Response drafted' },
  stamped_returned:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Stamped returned' },
  resubmission_requested: { bg: '#fff4d6', fg: '#a06200', label: 'Resubmission' },
  closed_out:             { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed out' },
  archived:               { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  rejected:               { bg: '#7a0e0e', fg: '#fff',    label: 'Rejected' },
  void:                   { bg: '#3a3a3a', fg: '#fff',    label: 'Void' },
  escalated:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
};

const TIER_TONE: Record<IpsTier, { bg: string; fg: string; label: string }> = {
  om_manual:         { bg: '#e3e7ec', fg: '#557',    label: 'O&M manual' },
  material_approval: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Material approval' },
  shop_drawing:      { bg: '#fff4d6', fg: '#a06200', label: 'Shop drawing' },
  critical_safety:   { bg: '#7a0e0e', fg: '#fff',    label: 'Critical safety' },
};

const URGENCY_TONE: Record<IpsUrgency, { bg: string; fg: string; label: string }> = {
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

const STAMP_TONE: Record<StampCode, { bg: string; fg: string; label: string }> = {
  A: { bg: '#cfe6d3', fg: '#1f5b3a', label: 'A — No exceptions' },
  B: { bg: '#daf5e2', fg: '#1f6b3a', label: 'B — Make corrections noted' },
  C: { bg: '#fff4d6', fg: '#a06200', label: 'C — Revise and resubmit' },
  D: { bg: '#fde0e0', fg: '#9b1f1f', label: 'D — Reviewed (info only)' },
  E: { bg: '#7a0e0e', fg: '#fff',    label: 'E — Rejected (resubmit required)' },
};

// Row 1: action / lifecycle pills (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active' },
  { key: 'all',              label: 'All' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'submitted',        label: 'Submitted' },
  { key: 'under_review',     label: 'Under review' },
  { key: 'stamped_returned', label: 'Stamped' },
  { key: 'stamp_e',          label: 'Stamp E' },
  { key: 'long_lead',        label: 'Long-lead' },
  { key: 'ccp',              label: 'CCP' },
  { key: 'witness',          label: 'Witness req' },
  { key: 'dispute',          label: 'Dispute' },
  { key: 'health_red',       label: 'Health red' },
  { key: 'health_critical',  label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'contractor_drafted',     label: 'Draft' },
  { key: 'package_assembled',      label: 'Assembled' },
  { key: 'screening',              label: 'Screening' },
  { key: 'assigned_to_reviewer',   label: 'Assigned' },
  { key: 'coordination_review',    label: 'Coordination' },
  { key: 'response_drafted',       label: 'Response drafted' },
  { key: 'resubmission_requested', label: 'Resub' },
  { key: 'closed_out',             label: 'Closed' },
  { key: 'archived',               label: 'Archived' },
  { key: 'rejected',               label: 'Rejected' },
  { key: 'void',                   label: 'Void' },
  { key: 'escalated',              label: 'Escalated' },
  { key: 'om_manual',              label: 'O&M' },
  { key: 'material_approval',      label: 'Material' },
  { key: 'shop_drawing',           label: 'Shop drawing' },
  { key: 'critical_safety',        label: 'Critical safety' },
];

type ActionKind =
  | 'assemble-package' | 'submit' | 'screen' | 'assign-reviewer'
  | 'commence-review' | 'coordinate-review' | 'draft-response'
  | 'stamp-return' | 'request-resubmission' | 'approve-with-comments'
  | 'close-out' | 'archive' | 'reject' | 'void' | 'escalate';

const ACTION_FOR_STATE: Partial<Record<ChainStatus, ActionKind>> = {
  contractor_drafted:     'assemble-package',
  package_assembled:      'submit',
  submitted:              'screen',
  screening:              'assign-reviewer',
  assigned_to_reviewer:   'commence-review',
  under_review:           'coordinate-review',
  coordination_review:    'draft-response',
  response_drafted:       'stamp-return',
  stamped_returned:       'close-out',
  resubmission_requested: 'assemble-package',
  closed_out:             'archive',
  escalated:              'close-out',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'assemble-package':      'Assemble package (Contractor PM)',
  'submit':                'Submit (Contractor PM — anchors URGENT SLA)',
  'screen':                'Screen (Doc Controller)',
  'assign-reviewer':       'Assign reviewer (Doc Controller)',
  'commence-review':       'Commence review (Engineer)',
  'coordinate-review':     'Coordination review (Engineer)',
  'draft-response':        'Draft response (Engineer)',
  'stamp-return':          'Stamp return (Engineer — SIGNATURE: stamp E crosses regulator EVERY tier when critical_safety OR CCP)',
  'request-resubmission':  'Request resubmission (Engineer — loops back to assemble_package, +cycle)',
  'approve-with-comments': 'Approve with comments (Engineer — stamp B default)',
  'close-out':             'Close out (Owner Rep)',
  'archive':               'Archive (Owner Rep — HARD terminal)',
  'reject':                'Reject (Owner Rep — SIGNATURE: stamp E; crosses regulator EVERY tier when long_lead AND cycles ≥ 3)',
  'void':                  'Void (Contractor PM — issuer pull, pre-assignment only)',
  'escalate':              'Escalate (Owner Rep — soft; crosses regulator on critical_safety + material_approval when witness required)',
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

interface KpiSummary {
  total: number;
  active_count: number;
  drafted_count: number;
  assembled_count: number;
  submitted_count: number;
  screening_count: number;
  assigned_count: number;
  review_phase_count: number;
  stamped_count: number;
  resub_count: number;
  closed_out_count: number;
  archived_count: number;
  rejected_count: number;
  void_count: number;
  escalated_count: number;
  critical_safety_count: number;
  breached: number;
  reportable_total: number;
  long_lead_count: number;
  ccp_count: number;
  witness_count: number;
  dispute_count: number;
  stamp_e_count: number;
  document_control_bridged_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  insurance_bridged_count: number;
  cod_bridged_count: number;
  cycles_total: number;
  completeness_avg: number;
}

export function IppSubmittalChainTab() {
  const [rows, setRows] = useState<IpsRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<IpsRow | null>(null);
  const [events, setEvents] = useState<IpsEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IpsRow[] } & KpiSummary }>('/ipp/submittals/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          drafted_count: data.drafted_count || 0,
          assembled_count: data.assembled_count || 0,
          submitted_count: data.submitted_count || 0,
          screening_count: data.screening_count || 0,
          assigned_count: data.assigned_count || 0,
          review_phase_count: data.review_phase_count || 0,
          stamped_count: data.stamped_count || 0,
          resub_count: data.resub_count || 0,
          closed_out_count: data.closed_out_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          void_count: data.void_count || 0,
          escalated_count: data.escalated_count || 0,
          critical_safety_count: data.critical_safety_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          long_lead_count: data.long_lead_count || 0,
          ccp_count: data.ccp_count || 0,
          witness_count: data.witness_count || 0,
          dispute_count: data.dispute_count || 0,
          stamp_e_count: data.stamp_e_count || 0,
          document_control_bridged_count: data.document_control_bridged_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          insurance_bridged_count: data.insurance_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          cycles_total: data.cycles_total || 0,
          completeness_avg: data.completeness_avg || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Submittal chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: IpsRow; events: IpsEvent[] } }>(`/ipp/submittals/chain/${id}`);
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
      if (filter === 'stamp_e')         return r.stamp_code === 'E';
      if (filter === 'long_lead')       return !!r.long_lead_item;
      if (filter === 'ccp')             return !!r.commissioning_critical;
      if (filter === 'witness')         return !!r.regulatory_witness_required;
      if (filter === 'dispute')         return !!r.dispute_history;
      if (filter === 'health_red')      return r.submittal_health_band_live === 'red';
      if (filter === 'health_critical') return r.submittal_health_band_live === 'critical';
      if (['om_manual', 'material_approval', 'shop_drawing', 'critical_safety'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, drafted_count: 0, assembled_count: 0,
    submitted_count: 0, screening_count: 0, assigned_count: 0,
    review_phase_count: 0, stamped_count: 0, resub_count: 0,
    closed_out_count: 0, archived_count: 0, rejected_count: 0,
    void_count: 0, escalated_count: 0, critical_safety_count: 0,
    breached: 0, reportable_total: 0, long_lead_count: 0, ccp_count: 0,
    witness_count: 0, dispute_count: 0, stamp_e_count: 0,
    document_control_bridged_count: 0, schedule_bridged_count: 0,
    evm_bridged_count: 0, procurement_bridged_count: 0,
    insurance_bridged_count: 0, cod_bridged_count: 0,
    cycles_total: 0, completeness_avg: 0,
  };

  const act = useCallback(async (action: ActionKind, row: IpsRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'assemble-package') {
        const cls = window.prompt('Submittal class (om_manual / material_approval / shop_drawing / critical_safety):', row.submittal_class ?? '');
        if (cls) body.submittal_class = cls;
        const title = window.prompt('Title / package description:', row.title ?? '');
        if (title) body.title = title;
      } else if (action === 'submit') {
        const trans = window.prompt('Transmittal number (TM-YYYYNNNN). NOTE: anchors URGENT SLA clock.', row.last_transmittal_number ?? '');
        if (trans) body.last_transmittal_number = trans;
      } else if (action === 'screen') {
        const ctrl = window.prompt('Doc Controller name:', row.doc_controller_name ?? '');
        if (ctrl) body.doc_controller_name = ctrl;
      } else if (action === 'assign-reviewer') {
        const name = window.prompt('Reviewer name:', row.reviewer_name ?? '');
        if (name) body.reviewer_name = name;
        const party = window.prompt('Reviewer party (engineer / IE / SHEQ):', row.reviewer_party ?? 'engineer');
        if (party) body.reviewer_party = party;
      } else if (action === 'commence-review') {
        const note = window.prompt('Review start note (Engineer):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'coordinate-review') {
        const disc = window.prompt('Coordination disciplines (comma-separated, e.g. civil,mechanical,electrical):', row.coordination_disciplines ?? '');
        if (disc) body.coordination_disciplines = disc;
      } else if (action === 'draft-response') {
        const summaryText = window.prompt('Comments summary (required for audit):', row.comments_summary ?? '');
        if (!summaryText) return;
        body.comments_summary = summaryText;
      } else if (action === 'stamp-return') {
        const stamp = window.prompt('Stamp code (A / B / C / D / E). NOTE: SIGNATURE — E crosses regulator EVERY tier when critical_safety OR commissioning_critical.', 'B');
        if (!stamp || !['A', 'B', 'C', 'D', 'E'].includes(stamp.toUpperCase())) return;
        body.stamp_code = stamp.toUpperCase();
      } else if (action === 'request-resubmission') {
        const reason = window.prompt('Resubmission reason (required, +1 cycle, loops to assemble_package):', row.reason_code ?? '');
        if (!reason) return;
        body.reason_code = reason;
      } else if (action === 'approve-with-comments') {
        const summaryText = window.prompt('Approval comments summary (stamp B default):', row.comments_summary ?? '');
        if (summaryText !== null) body.comments_summary = summaryText;
      } else if (action === 'close-out') {
        const ownerRep = window.prompt('Owner Rep name (closes out the submittal):', row.owner_rep_name ?? '');
        if (ownerRep) body.owner_rep_name = ownerRep;
      } else if (action === 'archive') {
        const note = window.prompt('Archive note (Owner Rep — HARD terminal, never crosses regulator):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject') {
        const reason = window.prompt('Reject reason (required). NOTE: W115 SIGNATURE STAMP-E — crosses regulator EVERY tier when long_lead_item AND cycle_count ≥ 3.', row.reject_reason ?? '');
        if (!reason) return;
        body.reject_reason = reason;
      } else if (action === 'void') {
        const reason = window.prompt('Void reason (issuer pull, pre-assignment only):', row.void_reason ?? '');
        if (!reason) return;
        body.void_reason = reason;
      } else if (action === 'escalate') {
        const reason = window.prompt('Escalation reason. NOTE: crosses regulator on critical_safety + material_approval when regulatory_witness_required.', row.escalation_reason ?? '');
        if (!reason) return;
        body.escalation_reason = reason;
      }
      await api.post(`/ipp/submittals/chain/${row.id}/${action}`, body);
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
            IPP Submittal &amp; Transmittal Lifecycle — ISO 19650-2 {'§5.7'} + CSI 01 33 00 (stamps A/B/C/D/E) + FIDIC Silver Book {'§6'} + NEC4 {'§54'} + REIPPPP Schedule 4 + DMRE
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 submittal chain:
            contractor drafted {'→'} package assembled {'→'} submitted {'→'} screening {'→'} assigned to reviewer {'→'} under review {'→'}
            coordination review {'→'} response drafted {'→'} stamped returned {'→'} resubmission (loops to assemble) {'→'} closed out {'→'} archived,
            with rejected (terminal, stamp E) / void (terminal, issuer pull) / escalated (soft) branches.
            URGENT SLA polarity (HOURS) on submitted: critical_safety 24h, shop_drawing 168h, material_approval 240h, om_manual 480h
            (<em>higher submittal-criticality gets TIGHTEST window</em>). FLOOR-AT-CRITICAL-SAFETY on ANY one of 5 flags
            (long-lead item, commissioning critical, regulatory witness required, lender information covenant, dispute history). SIGNATURE:
            <strong> stamp_return crosses regulator EVERY tier when stamp_code='E' AND (critical_safety OR commissioning_critical)</strong>
            (W115 STAMP-E-REJECT-CRITICAL hard line); reject crosses regulator EVERY tier when long_lead_item AND cycle_count {'≥'} 3;
            escalate crosses critical_safety + material_approval when regulatory_witness_required; close_out never crosses regulator;
            SLA breach crosses critical_safety + shop_drawing. 3-step authority ladder:
            contractor_PM {'→'} engineer {'→'} owner_rep. 6 bridges: W114 doc-control, W112 schedule, W113 EVM, W19 procurement, W23 insurance, W20 COD.
            Nightly cycle refresh at 00:30 UTC keeps completeness / health-band live.
          </p>
        </div>
      </header>

      {/* 8-card KPI strip — action-LEFT (most actionable first) */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Active"          value={kpis.active_count}          tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Submitted"       value={kpis.submitted_count}       tone={kpis.submitted_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Review phase"    value={kpis.review_phase_count}    tone={kpis.review_phase_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Stamp E"         value={kpis.stamp_e_count}         tone={kpis.stamp_e_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Long-lead"       value={kpis.long_lead_count}       tone={kpis.long_lead_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"    value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Critical safety" value={kpis.critical_safety_count} tone={kpis.critical_safety_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Total"           value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Drafted: <span className="font-semibold text-[#445]">{kpis.drafted_count}</span></span>
        <span>Assembled: <span className="font-semibold text-[#1a3a5c]">{kpis.assembled_count}</span></span>
        <span>Screening: <span className="font-semibold text-[#1a3a5c]">{kpis.screening_count}</span></span>
        <span>Assigned: <span className="font-semibold text-[#1a3a5c]">{kpis.assigned_count}</span></span>
        <span>Stamped: <span className="font-semibold text-[#1f6b3a]">{kpis.stamped_count}</span></span>
        <span>Resub: <span className="font-semibold text-[#a06200]">{kpis.resub_count}</span></span>
        <span>Closed: <span className="font-semibold text-[#1f5b3a]">{kpis.closed_out_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Rejected: <span className="font-semibold text-[#9b1f1f]">{kpis.rejected_count}</span></span>
        <span>Void: <span className="font-semibold text-[#6b7685]">{kpis.void_count}</span></span>
        <span>Escalated: <span className="font-semibold text-[#9b1f1f]">{kpis.escalated_count}</span></span>
        <span>CCP: <span className="font-semibold text-[#a06200]">{kpis.ccp_count}</span></span>
        <span>Witness: <span className="font-semibold text-[#a06200]">{kpis.witness_count}</span></span>
        <span>Dispute: <span className="font-semibold text-[#9b1f1f]">{kpis.dispute_count}</span></span>
        <span>Cycles total: <span className="font-semibold text-[#1a3a5c]">{kpis.cycles_total}</span></span>
        <span>Completeness avg: <span className="font-semibold text-[#1a3a5c]">{kpis.completeness_avg}/130</span></span>
        <span>W114 (doc): <span className="font-semibold text-[#1a3a5c]">{kpis.document_control_bridged_count}</span></span>
        <span>W112 (sch): <span className="font-semibold text-[#1a3a5c]">{kpis.schedule_bridged_count}</span></span>
        <span>W113 (EVM): <span className="font-semibold text-[#1a3a5c]">{kpis.evm_bridged_count}</span></span>
        <span>W19 (proc): <span className="font-semibold text-[#1a3a5c]">{kpis.procurement_bridged_count}</span></span>
        <span>W23 (ins): <span className="font-semibold text-[#1a3a5c]">{kpis.insurance_bridged_count}</span></span>
        <span>W20 (COD): <span className="font-semibold text-[#1a3a5c]">{kpis.cod_bridged_count}</span></span>
      </div>

      {/* Row 1: action / lifecycle pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
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

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Submittal #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Package</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Stamp</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Cycle</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Completeness</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const urgency = URGENCY_TONE[r.urgency_band_live ?? 'low'];
                const health = HEALTH_TONE[r.submittal_health_band_live ?? 'green'];
                const stamp = r.stamp_code ? STAMP_TONE[r.stamp_code] : null;
                const compl = r.submittal_completeness_index_live ?? r.submittal_completeness_index ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.submittal_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="text-[11px] font-medium">{r.project_name ?? r.project_id}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {fmtMw(r.project_capacity_mw)}
                        {r.long_lead_item ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">LLI</span> : null}
                        {r.commissioning_critical ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">CCP</span> : null}
                        {r.regulatory_witness_required ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">WIT</span> : null}
                        {r.lender_information_covenant ? <span className="ml-1 text-[9px] font-semibold text-[#6b7685]">LIC</span> : null}
                        {r.dispute_history ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">DSP</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.package_code ?? r.csi_section ?? '-'}</div>
                      <div className="text-[10px] text-[#6b7685] truncate max-w-[200px]">{r.title ?? r.drawing_title ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2">
                      {stamp ? (
                        <span className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold" style={{ background: stamp.bg, color: stamp.fg }}>
                          {r.stamp_code}
                        </span>
                      ) : <span className="text-[#6b7685]">-</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[#1a3a5c]">
                      <span className={r.cycle_count >= 3 ? 'font-bold text-[#9b1f1f]' : ''}>{r.cycle_count}</span>
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
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No submittals match.</td></tr>
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
  row: IpsRow;
  events: IpsEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: IpsRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const completeness = row.submittal_completeness_index_live ?? row.submittal_completeness_index;

  // Overflow actions allowed across non-terminal states.
  const canRequestResub: ChainStatus[] = ['response_drafted', 'stamped_returned', 'under_review', 'coordination_review'];
  const canApproveWithComments: ChainStatus[] = ['response_drafted', 'under_review', 'coordination_review'];
  const canEscalate: ChainStatus[] = [
    'screening', 'assigned_to_reviewer', 'under_review',
    'coordination_review', 'response_drafted', 'stamped_returned',
    'resubmission_requested',
  ];
  const canReject: ChainStatus[] = [
    'contractor_drafted', 'package_assembled', 'submitted', 'screening',
    'assigned_to_reviewer', 'under_review', 'coordination_review',
    'response_drafted', 'stamped_returned', 'resubmission_requested',
    'escalated',
  ];
  const canVoid: ChainStatus[] = [
    'contractor_drafted', 'package_assembled', 'submitted', 'screening',
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
              <div className="font-mono text-[12px] text-[#4a5568]">{row.submittal_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? row.project_id} — {fmtMw(row.project_capacity_mw)}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} Cycle <span className="font-mono text-[#1a3a5c]">{row.cycle_count}</span>
                {' '}{'•'} Stamp <span className="font-mono text-[#1a3a5c]">{row.stamp_code ?? '-'}</span>
                {' '}{'•'} Package <span className="text-[#1a3a5c]">{row.package_code ?? '-'}</span>
                {' '}{'•'} Completeness <span className="text-[#1a3a5c]">{completeness}/130</span>
              </div>
            </div>
            <button type="button"
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
            {row.submittal_health_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: HEALTH_TONE[row.submittal_health_band_live].bg, color: HEALTH_TONE[row.submittal_health_band_live].fg }}>
                Health: {HEALTH_TONE[row.submittal_health_band_live].label}
              </span>
            )}
            {row.stamp_code && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: STAMP_TONE[row.stamp_code].bg, color: STAMP_TONE[row.stamp_code].fg }}>
                {STAMP_TONE[row.stamp_code].label}
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
            {row.long_lead_item ? (
              <span className="inline-block rounded bg-[#fff4d6] px-2 py-0.5 font-semibold text-[#a06200]">Long-lead item</span>
            ) : null}
            {row.commissioning_critical ? (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">CCP</span>
            ) : null}
            {row.regulatory_witness_required ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Witness required</span>
            ) : null}
            {row.cycle_count >= 3 ? (
              <span className="inline-block rounded bg-[#9b1f1f] px-2 py-0.5 font-semibold text-white">Cycle ≥ 3</span>
            ) : null}
          </div>
        </header>

        <div className="p-5 space-y-4">
          {/* LIVE 20-field battery */}
          <Section title="LIVE battery (20 fields, re-computed every fetch)">
            <Grid>
              <Field label="Stamp code"             value={row.stamp_code ?? '-'} tone={row.stamp_code === 'E' ? 'bad' : row.stamp_code === 'A' || row.stamp_code === 'B' ? 'ok' : 'warn'} />
              <Field label="Cycle count"            value={String(row.cycle_count)} tone={row.cycle_count >= 3 ? 'bad' : row.cycle_count >= 2 ? 'warn' : 'ok'} />
              <Field label="Tier (re-derived)"      value={TIER_TONE[row.current_tier].label} tone={row.current_tier === 'critical_safety' ? 'bad' : row.current_tier === 'shop_drawing' ? 'warn' : 'ok'} />
              <Field label="Floor flags"            value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 1 ? 'bad' : 'ok'} />
              <Field label="Authority required"     value={row.authority_required_live ?? '-'} />
              <Field label="Completeness"           value={`${completeness} / 130`} tone={completeness >= 90 ? 'ok' : completeness >= 60 ? 'warn' : 'bad'} />
              <Field label="Health band"            value={row.submittal_health_band_live ?? '-'} />
              <Field label="Urgency"                value={row.urgency_band_live ?? '-'} />
              <Field label="SLA hours remaining"    value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"             value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Regulator filing window" value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
              <Field label="Witness window"         value={fmtHoursSla(row.regulatory_witness_window_hours_live)} />
              <Field label="Days to long-lead"      value={row.days_to_long_lead_deadline_live !== null && row.days_to_long_lead_deadline_live !== undefined ? `${row.days_to_long_lead_deadline_live}d` : '-'} tone={row.days_to_long_lead_deadline_live !== null && row.days_to_long_lead_deadline_live !== undefined && row.days_to_long_lead_deadline_live < 30 ? 'bad' : 'ok'} />
              <Field label="Comments open"          value={String(row.comments_open)} tone={row.comments_open > 0 ? 'warn' : 'ok'} />
              <Field label="Hash chain position"    value={String(row.hash_chain_position)} />
              <Field label="Merkle segment (W118)"  value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
              <Field label="Last transmittal #"     value={row.last_transmittal_number ?? '-'} />
              <Field label="Last transmittal at"    value={fmtDate(row.last_transmittal_at)} />
              <Field label="Reviewer"               value={row.reviewer_name ?? '-'} />
              <Field label="Owner Rep"              value={row.owner_rep_name ?? '-'} />
            </Grid>
          </Section>

          {/* Submittal identity (CSI 01 33 00) */}
          <Section title="Submittal identity (CSI 01 33 00 + ISO 19650-2 §5.7)">
            <Grid>
              <Field label="Submittal class"   value={row.submittal_class ?? '-'} />
              <Field label="Submittal type"    value={row.submittal_type ?? '-'} />
              <Field label="Discipline"        value={row.discipline ?? '-'} />
              <Field label="Package code"      value={row.package_code ?? '-'} />
              <Field label="CSI section"       value={row.csi_section ?? '-'} />
              <Field label="Drawing number"    value={row.drawing_number ?? '-'} />
              <Field label="Drawing title"     value={row.drawing_title ?? '-'} />
              <Field label="Contractor"        value={row.contractor_name ?? '-'} />
              <Field label="Supplier"          value={row.supplier_name ?? '-'} />
              <Field label="Contractor PM"     value={row.contractor_pm_name ?? '-'} />
              <Field label="Doc Controller"    value={row.doc_controller_name ?? '-'} />
              <Field label="Reviewer party"    value={row.reviewer_party ?? '-'} />
              <Field label="Coord disciplines" value={row.coordination_disciplines ?? '-'} />
              <Field label="Long-lead deadline" value={fmtDate(row.long_lead_deadline_at)} />
            </Grid>
          </Section>

          {/* Bridges */}
          <Section title="6-bridge architecture (W114 / W112 / W113 / W19 / W23 / W20)">
            <Grid>
              <Field label="W114 doc-control ref" value={row.document_control_ref ?? '-'} tone={row.bridges_to_document_control_chain_live ? 'ok' : 'warn'} />
              <Field label="W112 schedule ref"    value={row.schedule_ref ?? '-'}         tone={row.bridges_to_schedule_chain_live ? 'ok' : 'warn'} />
              <Field label="W113 EVM ref"         value={row.evm_ref ?? '-'}              tone={row.bridges_to_evm_chain_live ? 'ok' : 'warn'} />
              <Field label="W19 procurement ref"  value={row.procurement_ref ?? '-'}      tone={row.bridges_to_procurement_chain_live ? 'ok' : 'warn'} />
              <Field label="W23 insurance ref"    value={row.insurance_ref ?? '-'}        tone={row.bridges_to_insurance_chain_live ? 'ok' : 'warn'} />
              <Field label="W20 COD ref"          value={row.cod_ref ?? '-'}              tone={row.bridges_to_cod_chain_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"  value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"        value={row.regulator_ref ?? '-'} />
              <Field label="Last responder"       value={row.last_responder_party ?? '-'} />
              <Field label="Ball-in-court"        value={row.current_ball_in_court_party ?? '-'} />
            </Grid>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5) — ANY one triggers FLOOR-AT-CRITICAL-SAFETY">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="Long-lead item"               on={!!row.long_lead_item} />
              <FlagPill label="Commissioning critical"       on={!!row.commissioning_critical} />
              <FlagPill label="Regulatory witness required"  on={!!row.regulatory_witness_required} />
              <FlagPill label="Lender information covenant"  on={!!row.lender_information_covenant} />
              <FlagPill label="Dispute history"              on={!!row.dispute_history} />
            </div>
          </Section>

          {/* Reasons */}
          {(row.reject_reason || row.void_reason || row.escalation_reason || row.comments_summary || row.narrative || row.reason_code) && (
            <Section title="Reasons / narrative">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.reason_code && <div><strong>Reason code:</strong> {row.reason_code}</div>}
                {row.reject_reason && <div><strong>Reject reason:</strong> {row.reject_reason}</div>}
                {row.void_reason && <div><strong>Void reason:</strong> {row.void_reason}</div>}
                {row.escalation_reason && <div><strong>Escalation reason:</strong> {row.escalation_reason}</div>}
                {row.comments_summary && <div><strong>Comments summary:</strong> {row.comments_summary}</div>}
                {row.narrative && <div><strong>Narrative:</strong> {row.narrative}</div>}
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
              {canApproveWithComments.includes(row.chain_status) && (
                <ActionButton tone="primary" onClick={() => onAct('approve-with-comments', row)}>
                  {ACTION_LABEL['approve-with-comments']}
                </ActionButton>
              )}
              {canRequestResub.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('request-resubmission', row)}>
                  {ACTION_LABEL['request-resubmission']}
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
                  {e.stamp_code && <span className="rounded bg-[#fff4d6] px-1.5 py-0.5 font-semibold text-[#a06200]">Stamp {e.stamp_code}</span>}
                  {e.cycle_count !== null && e.cycle_count !== undefined && <span className="text-[#6b7685]">cyc {e.cycle_count}</span>}
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
    <button type="button"
      onClick={onClick}
      className="rounded px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
      style={{ background: bg }}
    >
      {children}
    </button>
  );
}
