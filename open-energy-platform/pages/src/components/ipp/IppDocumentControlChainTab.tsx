// Wave 114 — IPP Document Control & Drawing Register chain (P6).
//
// 9th IPP chain. THIRD wave of Phase A IPP-parity push (after W112 WBS &
// Gantt and W113 Cost & EVM). Drawing register + IDC matrix + transmittal
// + review + comment + revise + approve + IFC + as-built + archive engine.
// Beats Aconex / Procore Documents / Bluebeam Studio / Newforma / Asite /
// Oracle Aconex / Bentley ProjectWise / Autodesk Construction Cloud Docs /
// SharePoint AECOM / e-Builder.
//
// 12-state P6 forward + 3 branches (rejected, withdrawn, hold) with URGENT
// SLA polarity stored in HOURS: safety_critical 24h, electrical 72h,
// mechanical 120h, civil 168h on transmitted anchor (higher discipline-
// criticality gets TIGHTEST window). FLOOR-AT-SAFETY-CRITICAL on ANY one
// of 5 flags (hv_electrical, commissioning_critical_path,
// safety_signoff_required, ifc_blocking, regulatory_submittal). 3-step
// authority ladder: doc_controller -> engineer_of_record -> IPP_CEO.
// 20-field LIVE doc-control battery. 5-bridge architecture: W112 schedule,
// W113 EVM cost-book, W19 procurement, W20 COD, W18 planned outage.
//
// SIGNATURE Phase-A IPP regulator crossings:
//  * reject crosses EVERY tier when safety_critical OR ifc_blocking
//    (W114 SIGNATURE DOCUMENT-REJECT-CRITICAL hard line)
//  * withdraw crosses EVERY tier when issued_for_construction reached
//  * approve crosses safety_critical only when hv_electrical OR ccp
//  * archive never crosses regulator
//  * sla_breached crosses safety_critical + electrical (heavy tiers)
//
// Standards: ISO 19650-1/2/3 + AECOOEM ED2-2024 + REIPPPP Schedule 2 +
// DMRE site-records + IEC 61355 + ENAA EPC + FIDIC Silver Book §6.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'draft_uploaded' | 'metadata_indexed' | 'revision_open' | 'IDC_assigned'
  | 'transmitted' | 'reviewed' | 'commented' | 'revised' | 'approved'
  | 'issued_for_construction' | 'as_built_finalised' | 'archived'
  | 'rejected' | 'withdrawn' | 'hold';

type IpdTier = 'civil' | 'mechanical' | 'electrical' | 'safety_critical';
type IpdUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'doc_controller' | 'engineer_of_record' | 'IPP_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type IdcStatus = 'open' | 'review' | 'approved' | 'closed';

interface IpdRow {
  id: string;
  document_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  planned_outage_ref: string | null;
  document_class: string | null;
  document_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  drawing_title: string | null;
  iec_61355_code: string | null;
  current_revision: string | null;
  revisions_count: number;
  last_transmittal_number: string | null;
  last_transmittal_at: string | null;
  reviewer_name: string | null;
  reviewer_party: string | null;
  approver_name: string | null;
  approver_party: string | null;
  idc_status: string | null;
  idc_matrix_recomputed_at: string | null;
  hv_electrical: number;
  commissioning_critical_path: number;
  safety_signoff_required: number;
  ifc_blocking: number;
  regulatory_submittal: number;
  reached_ifc: number;
  current_tier: IpdTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  doc_health_band: HealthBand | null;
  document_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  hold_reason: string | null;
  comments_summary: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  draft_uploaded_at: string | null;
  metadata_indexed_at: string | null;
  revision_open_at: string | null;
  idc_assigned_at: string | null;
  transmitted_at: string | null;
  reviewed_at: string | null;
  commented_at: string | null;
  revised_at: string | null;
  approved_at: string | null;
  issued_for_construction_at: string | null;
  as_built_finalised_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  hold_at: string | null;
  resumed_at: string | null;
  signoff_at: string | null;
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
  urgency_band_live?: IpdUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  idc_status_live?: IdcStatus;
  document_completeness_index_live?: number;
  doc_health_band_live?: HealthBand;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
  bridges_to_planned_outage_chain_live?: boolean;
}

interface IpdEvent {
  id: string;
  document_id: string;
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
  draft_uploaded:          { bg: '#e3e7ec', fg: '#445',    label: 'Draft uploaded' },
  metadata_indexed:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Metadata indexed' },
  revision_open:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Revision open' },
  IDC_assigned:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'IDC assigned' },
  transmitted:             { bg: '#fff4d6', fg: '#a06200', label: 'Transmitted' },
  reviewed:                { bg: '#fff4d6', fg: '#a06200', label: 'Reviewed' },
  commented:               { bg: '#fff4d6', fg: '#a06200', label: 'Commented' },
  revised:                 { bg: '#fff4d6', fg: '#a06200', label: 'Revised' },
  approved:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  issued_for_construction: { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Issued for construction' },
  as_built_finalised:      { bg: '#cfe6d3', fg: '#1f5b3a', label: 'As-built finalised' },
  archived:                { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  rejected:                { bg: '#7a0e0e', fg: '#fff',    label: 'Rejected' },
  withdrawn:               { bg: '#3a3a3a', fg: '#fff',    label: 'Withdrawn' },
  hold:                    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Hold' },
};

const TIER_TONE: Record<IpdTier, { bg: string; fg: string; label: string }> = {
  civil:           { bg: '#e3e7ec', fg: '#557',    label: 'Civil' },
  mechanical:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Mechanical' },
  electrical:      { bg: '#fff4d6', fg: '#a06200', label: 'Electrical' },
  safety_critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Safety-critical' },
};

const URGENCY_TONE: Record<IpdUrgency, { bg: string; fg: string; label: string }> = {
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

const IDC_TONE: Record<IdcStatus, { bg: string; fg: string; label: string }> = {
  open:     { bg: '#e3e7ec', fg: '#557',    label: 'Open' },
  review:   { bg: '#fff4d6', fg: '#a06200', label: 'Review' },
  approved: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  closed:   { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed' },
};

// 2-row filter pills — Row 1: action / lifecycle (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',                  label: 'Active' },
  { key: 'all',                     label: 'All' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'transmitted',             label: 'In transit' },
  { key: 'reviewed',                label: 'Reviewed' },
  { key: 'commented',               label: 'Commented' },
  { key: 'revised',                 label: 'Revised' },
  { key: 'approved',                label: 'Approved' },
  { key: 'hv_electrical',           label: 'HV electrical' },
  { key: 'ifc_blocking',            label: 'IFC blocking' },
  { key: 'ccp',                     label: 'CCP' },
  { key: 'health_red',              label: 'Health red' },
  { key: 'health_critical',         label: 'Health critical' },
];

// 2-row filter pills — Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'draft_uploaded',          label: 'Draft' },
  { key: 'metadata_indexed',        label: 'Indexed' },
  { key: 'IDC_assigned',            label: 'IDC assigned' },
  { key: 'issued_for_construction', label: 'IFC' },
  { key: 'as_built_finalised',      label: 'As-built' },
  { key: 'archived',                label: 'Archived' },
  { key: 'rejected',                label: 'Rejected' },
  { key: 'withdrawn',               label: 'Withdrawn' },
  { key: 'hold',                    label: 'Hold' },
  { key: 'civil',                   label: 'Civil' },
  { key: 'mechanical',              label: 'Mechanical' },
  { key: 'electrical',              label: 'Electrical' },
  { key: 'safety_critical',         label: 'Safety-critical' },
];

type ActionKind =
  | 'index-metadata' | 'open-revision' | 'assign-idc' | 'transmit'
  | 'start-review' | 'comment' | 'revise' | 'approve'
  | 'issue-for-construction' | 'finalise-as-built' | 'archive'
  | 'reject' | 'withdraw' | 'hold' | 'resume';

// What's the NEXT primary action for each non-terminal state?
const ACTION_FOR_STATE: Partial<Record<ChainStatus, ActionKind>> = {
  draft_uploaded:          'index-metadata',
  metadata_indexed:        'assign-idc',
  revision_open:           'assign-idc',
  IDC_assigned:            'transmit',
  transmitted:             'start-review',
  reviewed:                'comment',
  commented:               'revise',
  revised:                 'approve',
  approved:                'issue-for-construction',
  issued_for_construction: 'finalise-as-built',
  as_built_finalised:      'archive',
  hold:                    'resume',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'index-metadata':         'Index metadata (Doc Controller)',
  'open-revision':          'Open new revision (Doc Controller)',
  'assign-idc':             'Assign IDC reviewer (Doc Controller)',
  'transmit':               'Transmit to reviewer (Doc Controller — anchors URGENT SLA)',
  'start-review':           'Start review (Engineer of Record)',
  'comment':                'Comment (Engineer of Record)',
  'revise':                 'Revise (Engineer of Record)',
  'approve':                'Approve (Engineer of Record — safety-critical crosses regulator when HV electrical OR CCP)',
  'issue-for-construction': 'Issue for construction (Engineer of Record — sticky reached_ifc marker)',
  'finalise-as-built':      'Finalise as-built (Engineer of Record)',
  'archive':                'Archive (Doc Controller — HARD terminal, never crosses regulator)',
  'reject':                 'Reject (Engineer of Record — SIGNATURE DOCUMENT-REJECT-CRITICAL: crosses regulator EVERY tier when safety_critical OR ifc_blocking)',
  'withdraw':               'Withdraw (IPP CEO — crosses regulator EVERY tier when issued_for_construction was reached)',
  'hold':                   'Hold (Doc Controller — soft pause from review states)',
  'resume':                 'Resume from hold (Doc Controller)',
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
  draft_count: number;
  indexed_count: number;
  idc_assigned_count: number;
  transmitted_count: number;
  review_phase_count: number;
  approved_count: number;
  ifc_count: number;
  as_built_count: number;
  archived_count: number;
  rejected_count: number;
  withdrawn_count: number;
  hold_count: number;
  safety_critical_count: number;
  breached: number;
  reportable_total: number;
  reached_ifc_count: number;
  hv_electrical_count: number;
  ifc_blocking_count: number;
  ccp_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  cod_bridged_count: number;
  planned_outage_bridged_count: number;
  revisions_total: number;
  completeness_avg: number;
}

export function IppDocumentControlChainTab() {
  const [rows, setRows] = useState<IpdRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<IpdRow | null>(null);
  const [events, setEvents] = useState<IpdEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IpdRow[] } & KpiSummary }>('/ipp/document-control/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          draft_count: data.draft_count || 0,
          indexed_count: data.indexed_count || 0,
          idc_assigned_count: data.idc_assigned_count || 0,
          transmitted_count: data.transmitted_count || 0,
          review_phase_count: data.review_phase_count || 0,
          approved_count: data.approved_count || 0,
          ifc_count: data.ifc_count || 0,
          as_built_count: data.as_built_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          hold_count: data.hold_count || 0,
          safety_critical_count: data.safety_critical_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          reached_ifc_count: data.reached_ifc_count || 0,
          hv_electrical_count: data.hv_electrical_count || 0,
          ifc_blocking_count: data.ifc_blocking_count || 0,
          ccp_count: data.ccp_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          planned_outage_bridged_count: data.planned_outage_bridged_count || 0,
          revisions_total: data.revisions_total || 0,
          completeness_avg: data.completeness_avg || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Document Control chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: IpdRow; events: IpdEvent[] } }>(`/ipp/document-control/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')               return true;
      if (filter === 'active')            return !r.is_terminal;
      if (filter === 'reportable')        return r.is_reportable_flag;
      if (filter === 'breached')          return r.sla_breached_live;
      if (filter === 'hv_electrical')     return !!r.hv_electrical;
      if (filter === 'ifc_blocking')      return !!r.ifc_blocking;
      if (filter === 'ccp')               return !!r.commissioning_critical_path;
      if (filter === 'health_red')        return r.doc_health_band_live === 'red';
      if (filter === 'health_critical')   return r.doc_health_band_live === 'critical';
      if (['civil', 'mechanical', 'electrical', 'safety_critical'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, draft_count: 0, indexed_count: 0,
    idc_assigned_count: 0, transmitted_count: 0, review_phase_count: 0,
    approved_count: 0, ifc_count: 0, as_built_count: 0, archived_count: 0,
    rejected_count: 0, withdrawn_count: 0, hold_count: 0,
    safety_critical_count: 0, breached: 0, reportable_total: 0,
    reached_ifc_count: 0, hv_electrical_count: 0, ifc_blocking_count: 0,
    ccp_count: 0, schedule_bridged_count: 0, evm_bridged_count: 0,
    procurement_bridged_count: 0, cod_bridged_count: 0,
    planned_outage_bridged_count: 0, revisions_total: 0,
    completeness_avg: 0,
  };

  const act = useCallback(async (action: ActionKind, row: IpdRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'index-metadata') {
        const cls = window.prompt('Document class (civil / mechanical / electrical / safety_critical):', row.document_class ?? '');
        if (cls) body.document_class = cls;
        const code = window.prompt('IEC 61355 code (optional):', row.iec_61355_code ?? '');
        if (code) body.iec_61355_code = code;
        const title = window.prompt('Drawing title:', row.drawing_title ?? '');
        if (title) body.drawing_title = title;
      } else if (action === 'open-revision') {
        const rev = window.prompt('New revision (e.g. B):', row.current_revision ?? '');
        if (rev) body.current_revision = rev;
      } else if (action === 'assign-idc') {
        const name = window.prompt('Reviewer name:', row.reviewer_name ?? '');
        if (name) body.reviewer_name = name;
        const party = window.prompt('Reviewer party (engineer_of_record / IE / SHEQ):', row.reviewer_party ?? 'engineer_of_record');
        if (party) body.reviewer_party = party;
      } else if (action === 'transmit') {
        const trans = window.prompt('Transmittal number (TM-YYYYNNNN). NOTE: anchors URGENT SLA clock.', row.last_transmittal_number ?? '');
        if (trans) body.last_transmittal_number = trans;
      } else if (action === 'start-review') {
        const note = window.prompt('Review start note (Engineer of Record):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'comment') {
        const summary = window.prompt('Comments summary (required for audit):', row.comments_summary ?? '');
        if (!summary) return;
        body.comments_summary = summary;
      } else if (action === 'revise') {
        const rev = window.prompt('Revised revision (e.g. B):', row.current_revision ?? '');
        if (rev) body.current_revision = rev;
      } else if (action === 'approve') {
        const name = window.prompt('Approver name (Engineer of Record). NOTE: safety-critical crosses regulator when HV electrical OR commissioning critical path.', row.approver_name ?? '');
        if (name) body.approver_name = name;
        const party = window.prompt('Approver party (engineer_of_record / IPP_CEO):', row.approver_party ?? 'engineer_of_record');
        if (party) body.approver_party = party;
      } else if (action === 'issue-for-construction') {
        const note = window.prompt('IFC note (Engineer of Record — sticky reached_ifc marker, withdraw will cross regulator after IFC).', '');
        if (note !== null) body.notes = note;
      } else if (action === 'finalise-as-built') {
        const note = window.prompt('As-built finalisation note (Engineer of Record):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive note (Doc Controller — HARD terminal, never crosses regulator):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject') {
        const reason = window.prompt('Reject reason (required). NOTE: W114 SIGNATURE DOCUMENT-REJECT-CRITICAL — crosses regulator EVERY tier when safety_critical OR ifc_blocking flag set.', row.reject_reason ?? '');
        if (!reason) return;
        body.reject_reason = reason;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdraw reason (required). NOTE: crosses regulator EVERY tier when issued_for_construction was reached (post-IFC withdrawal = construction-record void).', row.withdraw_reason ?? '');
        if (!reason) return;
        body.withdraw_reason = reason;
      } else if (action === 'hold') {
        const reason = window.prompt('Hold reason (soft pause; resume returns to reviewed):', row.hold_reason ?? '');
        if (!reason) return;
        body.hold_reason = reason;
      } else if (action === 'resume') {
        const note = window.prompt('Resume note (returns to reviewed):', '');
        if (note !== null) body.notes = note;
      }
      await api.post(`/ipp/document-control/chain/${row.id}/${action}`, body);
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
            IPP Document Control &amp; Drawing Register — ISO 19650-1/2/3 + AECOOEM ED2-2024 + REIPPPP Schedule 2 + DMRE + IEC 61355 + FIDIC Silver Book {'§6'}
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 drawing-control lifecycle:
            draft uploaded {'→'} metadata indexed {'→'} revision open {'→'} IDC assigned {'→'} transmitted {'→'} reviewed {'→'} commented {'→'} revised {'→'} approved {'→'}
            issued for construction {'→'} as-built finalised {'→'} archived, with rejected (terminal) / withdrawn (terminal) / hold (soft pause) branches.
            URGENT SLA polarity (HOURS) on transmitted: safety_critical 24h, electrical 72h, mechanical 120h, civil 168h
            (<em>higher discipline-criticality gets TIGHTEST window</em>). FLOOR-AT-SAFETY-CRITICAL on ANY one of 5 flags
            (HV electrical, commissioning critical path, safety sign-off required, IFC-blocking, regulatory submittal). SIGNATURE:
            <strong> reject crosses regulator EVERY tier when safety_critical OR ifc_blocking</strong> (W114 DOCUMENT-REJECT-CRITICAL hard line);
            withdraw crosses regulator EVERY tier when issued_for_construction was reached (post-IFC withdrawal = construction-record void);
            approve crosses safety-critical only when HV electrical OR commissioning critical path; archive never crosses regulator;
            SLA breach crosses safety_critical + electrical. 3-step authority ladder:
            doc_controller {'→'} engineer_of_record {'→'} IPP_CEO. 5 bridges: W112 schedule, W113 EVM, W19 procurement, W20 COD, W18 planned outage.
            Nightly IDC matrix recompute at 00:25 UTC keeps idc_status / completeness / health band live.
          </p>
        </div>
      </header>

      {/* 8-card KPI strip — action-LEFT (most actionable first) */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Active"            value={kpis.active_count}           tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="In transit"        value={kpis.transmitted_count}      tone={kpis.transmitted_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Review phase"      value={kpis.review_phase_count}     tone={kpis.review_phase_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="HV electrical"     value={kpis.hv_electrical_count}    tone={kpis.hv_electrical_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="IFC blocking"      value={kpis.ifc_blocking_count}     tone={kpis.ifc_blocking_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"      value={kpis.breached}               tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Safety-critical"   value={kpis.safety_critical_count}  tone={kpis.safety_critical_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total"             value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Reached IFC: <span className="font-semibold text-[#1f6b3a]">{kpis.reached_ifc_count}</span></span>
        <span>Draft: <span className="font-semibold text-[#445]">{kpis.draft_count}</span></span>
        <span>Indexed: <span className="font-semibold text-[#1a3a5c]">{kpis.indexed_count}</span></span>
        <span>IDC assigned: <span className="font-semibold text-[#1a3a5c]">{kpis.idc_assigned_count}</span></span>
        <span>Approved: <span className="font-semibold text-[#1f6b3a]">{kpis.approved_count}</span></span>
        <span>IFC: <span className="font-semibold text-[#1f5b3a]">{kpis.ifc_count}</span></span>
        <span>As-built: <span className="font-semibold text-[#1f5b3a]">{kpis.as_built_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Rejected: <span className="font-semibold text-[#9b1f1f]">{kpis.rejected_count}</span></span>
        <span>Withdrawn: <span className="font-semibold text-[#6b7685]">{kpis.withdrawn_count}</span></span>
        <span>Hold: <span className="font-semibold text-[#a06200]">{kpis.hold_count}</span></span>
        <span>CCP: <span className="font-semibold text-[#9b1f1f]">{kpis.ccp_count}</span></span>
        <span>Revisions: <span className="font-semibold text-[#1a3a5c]">{kpis.revisions_total}</span></span>
        <span>Completeness avg: <span className="font-semibold text-[#1a3a5c]">{kpis.completeness_avg}/130</span></span>
        <span>W112 (schedule): <span className="font-semibold text-[#1a3a5c]">{kpis.schedule_bridged_count}</span></span>
        <span>W113 (EVM): <span className="font-semibold text-[#1a3a5c]">{kpis.evm_bridged_count}</span></span>
        <span>W19 (procurement): <span className="font-semibold text-[#1a3a5c]">{kpis.procurement_bridged_count}</span></span>
        <span>W20 (COD): <span className="font-semibold text-[#1a3a5c]">{kpis.cod_bridged_count}</span></span>
        <span>W18 (planned outage): <span className="font-semibold text-[#1a3a5c]">{kpis.planned_outage_bridged_count}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Document #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Drawing</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Rev</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">IDC</th>
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
                const health = HEALTH_TONE[r.doc_health_band_live ?? 'green'];
                const idc = IDC_TONE[(r.idc_status_live ?? 'open') as IdcStatus];
                const compl = r.document_completeness_index_live ?? r.document_completeness_index ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.document_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="text-[11px] font-medium">{r.project_name ?? r.project_id}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {fmtMw(r.project_capacity_mw)}
                        {r.hv_electrical ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">HV</span> : null}
                        {r.commissioning_critical_path ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">CCP</span> : null}
                        {r.ifc_blocking ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">IFC-BLK</span> : null}
                        {r.regulatory_submittal ? <span className="ml-1 text-[9px] font-semibold text-[#6b7685]">REG-SUB</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.drawing_number ?? '-'}</div>
                      <div className="text-[10px] text-[#6b7685] truncate max-w-[200px]">{r.drawing_title ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[#1a3a5c]">{r.current_revision ?? '-'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: idc.bg, color: idc.fg }}>
                        {idc.label}
                      </span>
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
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No documents match.</td></tr>
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
  row: IpdRow;
  events: IpdEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: IpdRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const completeness = row.document_completeness_index_live ?? row.document_completeness_index;
  const idcLive = (row.idc_status_live ?? row.idc_status ?? 'open') as IdcStatus;

  // Overflow actions allowed across non-terminal states.
  const canOpenRevision: ChainStatus[] = ['metadata_indexed', 'issued_for_construction', 'as_built_finalised'];
  const canHold: ChainStatus[] = ['transmitted', 'reviewed', 'commented', 'revised'];
  const canReject: ChainStatus[] = [
    'draft_uploaded', 'metadata_indexed', 'revision_open', 'IDC_assigned',
    'transmitted', 'reviewed', 'commented', 'revised', 'approved',
    'issued_for_construction', 'as_built_finalised', 'hold',
  ];
  const canWithdraw: ChainStatus[] = canReject;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[896px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.document_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? row.project_id} — {fmtMw(row.project_capacity_mw)}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} Rev <span className="font-mono text-[#1a3a5c]">{row.current_revision ?? '-'}</span>
                {' '}{'•'} Drawing <span className="text-[#1a3a5c]">{row.drawing_number ?? '-'}</span>
                {' '}{'•'} IDC <span className="text-[#1a3a5c]">{IDC_TONE[idcLive].label}</span>
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
            {row.doc_health_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: HEALTH_TONE[row.doc_health_band_live].bg, color: HEALTH_TONE[row.doc_health_band_live].fg }}>
                Health: {HEALTH_TONE[row.doc_health_band_live].label}
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
            {row.reached_ifc ? (
              <span className="inline-block rounded bg-[#1f5b3a] px-2 py-0.5 font-semibold text-white">Reached IFC</span>
            ) : null}
            {row.hv_electrical ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">HV electrical</span>
            ) : null}
            {row.ifc_blocking ? (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">IFC blocking</span>
            ) : null}
            {row.commissioning_critical_path ? (
              <span className="inline-block rounded bg-[#fff4d6] px-2 py-0.5 font-semibold text-[#a06200]">CCP</span>
            ) : null}
          </div>
        </header>

        <div className="p-5 space-y-4">
          {/* LIVE 20-field battery */}
          <Section title="LIVE battery (20 fields, re-computed every fetch)">
            <Grid>
              <Field label="Current revision"        value={row.current_revision ?? '-'} />
              <Field label="Revisions count"         value={String(row.revisions_count)} tone={row.revisions_count > 3 ? 'warn' : 'ok'} />
              <Field label="IDC status (live)"       value={IDC_TONE[idcLive].label} />
              <Field label="Document class"          value={row.document_class ?? '-'} />
              <Field label="Tier (re-derived)"       value={TIER_TONE[row.current_tier].label} tone={row.current_tier === 'safety_critical' ? 'bad' : row.current_tier === 'electrical' ? 'warn' : 'ok'} />
              <Field label="Floor flags"             value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 1 ? 'bad' : 'ok'} />
              <Field label="Authority required"      value={row.authority_required_live ?? '-'} />
              <Field label="Completeness"            value={`${completeness} / 130`} tone={completeness >= 90 ? 'ok' : completeness >= 60 ? 'warn' : 'bad'} />
              <Field label="Health band"             value={row.doc_health_band_live ?? '-'} />
              <Field label="Urgency"                 value={row.urgency_band_live ?? '-'} />
              <Field label="SLA hours remaining"     value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"              value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Regulator filing window" value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
              <Field label="Reached IFC"             value={row.reached_ifc ? 'YES' : 'no'} tone={row.reached_ifc ? 'warn' : 'ok'} />
              <Field label="Hash chain position"     value={String(row.hash_chain_position)} />
              <Field label="Merkle segment (W118)"   value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
              <Field label="Last transmittal #"      value={row.last_transmittal_number ?? '-'} />
              <Field label="Last transmittal at"     value={fmtDate(row.last_transmittal_at)} />
              <Field label="Reviewer"                value={row.reviewer_name ?? '-'} />
              <Field label="Approver"                value={row.approver_name ?? '-'} />
            </Grid>
          </Section>

          {/* Drawing identity */}
          <Section title="Drawing identity (IEC 61355 + ISO 19650 metadata)">
            <Grid>
              <Field label="Drawing number"      value={row.drawing_number ?? '-'} />
              <Field label="Drawing title"       value={row.drawing_title ?? '-'} />
              <Field label="Discipline"          value={row.discipline ?? '-'} />
              <Field label="Document type"       value={row.document_type ?? '-'} />
              <Field label="Package code"        value={row.package_code ?? '-'} />
              <Field label="IEC 61355 code"      value={row.iec_61355_code ?? '-'} />
              <Field label="Project type"        value={row.project_type ?? '-'} />
              <Field label="Project ID"          value={row.project_id} />
            </Grid>
          </Section>

          {/* Bridges */}
          <Section title="5-bridge architecture (W112 / W113 / W19 / W20 / W18)">
            <Grid>
              <Field label="W112 schedule ref"       value={row.schedule_ref ?? '-'}       tone={row.bridges_to_schedule_chain_live ? 'ok' : 'warn'} />
              <Field label="W113 EVM ref"            value={row.evm_ref ?? '-'}            tone={row.bridges_to_evm_chain_live ? 'ok' : 'warn'} />
              <Field label="W19 procurement ref"     value={row.procurement_ref ?? '-'}    tone={row.bridges_to_procurement_chain_live ? 'ok' : 'warn'} />
              <Field label="W20 COD ref"             value={row.cod_ref ?? '-'}            tone={row.bridges_to_cod_chain_live ? 'ok' : 'warn'} />
              <Field label="W18 planned outage ref"  value={row.planned_outage_ref ?? '-'} tone={row.bridges_to_planned_outage_chain_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"     value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"           value={row.regulator_ref ?? '-'} />
              <Field label="Last responder"          value={row.last_responder_party ?? '-'} />
            </Grid>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5) — ANY one triggers FLOOR-AT-SAFETY-CRITICAL">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="HV electrical"                on={!!row.hv_electrical} />
              <FlagPill label="Commissioning critical path"  on={!!row.commissioning_critical_path} />
              <FlagPill label="Safety sign-off required"     on={!!row.safety_signoff_required} />
              <FlagPill label="IFC blocking"                 on={!!row.ifc_blocking} />
              <FlagPill label="Regulatory submittal"         on={!!row.regulatory_submittal} />
            </div>
          </Section>

          {/* Reasons */}
          {(row.reject_reason || row.withdraw_reason || row.hold_reason || row.comments_summary || row.narrative) && (
            <Section title="Reasons / narrative">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.reject_reason && <div><strong>Reject reason:</strong> {row.reject_reason}</div>}
                {row.withdraw_reason && <div><strong>Withdraw reason:</strong> {row.withdraw_reason}</div>}
                {row.hold_reason && <div><strong>Hold reason:</strong> {row.hold_reason}</div>}
                {row.comments_summary && <div><strong>Comments summary:</strong> {row.comments_summary}</div>}
                {row.narrative && <div><strong>Narrative:</strong> {row.narrative}</div>}
              </div>
            </Section>
          )}

          {/* Action ladder — primary 2-3 + overflow */}
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <ActionButton tone="primary" onClick={() => onAct(nextAction, row)}>
                  {ACTION_LABEL[nextAction]}
                </ActionButton>
              )}
              {canOpenRevision.includes(row.chain_status) && (
                <ActionButton tone="primary" onClick={() => onAct('open-revision', row)}>
                  {ACTION_LABEL['open-revision']}
                </ActionButton>
              )}
              {canHold.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('hold', row)}>
                  {ACTION_LABEL['hold']}
                </ActionButton>
              )}
              {canReject.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('reject', row)}>
                  {ACTION_LABEL['reject']}
                </ActionButton>
              )}
              {canWithdraw.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('withdraw', row)}>
                  {ACTION_LABEL['withdraw']}
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
