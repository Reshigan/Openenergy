// Wave 99 — IPP ITP / Quality Inspection & Test Plan tab.
//
// The forward-looking quality register a best-in-class IPP-PM stack drives at
// every construction stage. Beats Procore Quality + Aconex ITR + Bentley
// AssetWise + e-Builder ITR + Autodesk Construction Cloud Quality + Bluebeam
// Studio Quality via:
//   - 12-state P6 lifecycle (itp_drafted -> submitted -> under_review ->
//     approved -> released_to_site -> inspection_scheduled -> in_inspection
//     -> witness_attended -> result_recorded -> {passed | failed ->
//     corrective_action -> re_inspect -> in_inspection rejoin} ->
//     released_for_use -> archived) plus reject / withdraw / void terminals
//   - tier RE-DERIVED on every transition from priority x workflow class
//     with FLOOR-AT-HIGH for blocks_handover_milestone |
//     blocks_commercial_operation | safety_critical_test | regulator_hold_point
//   - URGENT SLA polarity (safety-critical and COD-blocker = tightest)
//   - ball-in-court tracking + authority tiered
//     (site_supervisor -> quality_engineer -> project_manager -> project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_quality_index (0-130 vs industry baseline=100 with witness,
//     first-time-pass, photo and root-cause bonuses), days_in_court,
//     predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings (W99 - NERSA s.C-5 + REIPPPP + OHSA s24
//     + IEC 61508): submit crosses EVERY tier on safety_critical_test;
//     approve EVERY tier on blocks_commercial_operation; record_result
//     (failed) EVERY tier on safety_critical_test OR blocks_commercial_operation;
//     void EVERY tier on blocks_commercial_operation OR safety_critical_test;
//     sla_breached crosses regulator EVERY tier on safety_critical_test and
//     high+critical on blocks_commercial_operation.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'itp_drafted' | 'submitted' | 'under_review' | 'approved' | 'released_to_site'
  | 'inspection_scheduled' | 'in_inspection' | 'witness_attended' | 'result_recorded'
  | 'passed' | 'failed' | 'corrective_action' | 'released_for_use' | 'archived'
  | 'rejected' | 'withdrawn' | 'voided';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'itp_civil_foundation' | 'itp_mechanical_assembly' | 'itp_electrical_lv'
  | 'itp_electrical_mv_hv' | 'itp_instrumentation_scada' | 'itp_pressure_vessel'
  | 'itp_protection_relay' | 'itp_grid_synchronisation' | 'itp_commissioning_test'
  | 'itp_handover_doc_pack';

interface ItpRow {
  id: string;
  itp_number: string;
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
  construction_stage: string | null;
  hold_point_ref: string | null;
  drawing_ref: string | null;
  specification_ref: string | null;
  acceptance_criteria: string | null;
  identified_at: string | null;
  blocks_handover_milestone: number;
  blocks_commercial_operation: number;
  safety_critical_test: number;
  regulator_hold_point: number;
  current_tier: Tier;
  authority_required: string | null;
  reinspection_count: number;
  photo_evidence_count: number;
  witness_attended: number;
  first_time_pass: number;
  root_cause_documented: number;
  inspection_cost_zar: number | null;
  rework_cost_zar: number | null;
  parent_itp_id: string | null;
  cod_blocker_ref: string | null;
  handover_blocker_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  rejected_reason: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  witness_party: string | null;
  chain_status: ChainStatus;
  submitted_at: string | null;
  under_review_at: string | null;
  approved_at: string | null;
  released_to_site_at: string | null;
  inspection_scheduled_at: string | null;
  in_inspection_at: string | null;
  witness_attended_at: string | null;
  result_recorded_at: string | null;
  passed_at: string | null;
  failed_at: string | null;
  corrective_action_at: string | null;
  released_for_use_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  voided_at: string | null;
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
  ipp_quality_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
}

interface ItpEvent {
  id: string;
  itp_id: string;
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
  rejected_count: number;
  withdrawn_count: number;
  voided_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  cod_count: number;
  handover_count: number;
  safety_count: number;
  hold_count: number;
  witness_count: number;
  first_time_pass_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  total_inspection_cost_zar: number;
  total_rework_cost_zar: number;
  witness_attendance_rate: number;
  first_time_pass_rate: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  itp_drafted:          { bg: '#e3e7ec', fg: '#557',    label: 'Drafted' },
  submitted:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  under_review:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Under review' },
  approved:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  released_to_site:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Released to site' },
  inspection_scheduled: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Insp. scheduled' },
  in_inspection:        { bg: '#fff4d6', fg: '#a06200', label: 'In inspection' },
  witness_attended:     { bg: '#fff4d6', fg: '#a06200', label: 'Witness attended' },
  result_recorded:      { bg: '#fff4d6', fg: '#a06200', label: 'Result recorded' },
  passed:               { bg: '#cfe9d7', fg: '#0f5132', label: 'Passed' },
  failed:               { bg: '#fde0e0', fg: '#9b1f1f', label: 'Failed' },
  corrective_action:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Corrective action' },
  released_for_use:     { bg: '#cfe9d7', fg: '#0f5132', label: 'Released for use' },
  archived:             { bg: '#cfe9d7', fg: '#0f5132', label: 'Archived' },
  rejected:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  withdrawn:            { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  voided:               { bg: '#fde0e0', fg: '#9b1f1f', label: 'Voided' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const URGENCY_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  amber:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Amber' },
  yellow:   { bg: '#fff4d6', fg: '#a06200', label: 'Yellow' },
  green:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Green' },
  terminal: { bg: '#e3e7ec', fg: '#557',    label: 'Terminal' },
};

const AUTHORITY_LABEL: Record<string, string> = {
  site_supervisor:  'Site supervisor',
  quality_engineer: 'Quality engineer',
  project_manager:  'Project manager',
  project_director: 'Project director',
};

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  itp_civil_foundation:      'Civil / foundation',
  itp_mechanical_assembly:   'Mechanical assembly',
  itp_electrical_lv:         'Electrical LV',
  itp_electrical_mv_hv:      'Electrical MV/HV',
  itp_instrumentation_scada: 'Instrumentation / SCADA',
  itp_pressure_vessel:       'Pressure vessel',
  itp_protection_relay:      'Protection relay',
  itp_grid_synchronisation:  'Grid synchronisation',
  itp_commissioning_test:    'Commissioning test',
  itp_handover_doc_pack:     'Handover doc pack',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                 label: 'Open' },
  { key: 'all',                  label: 'All' },
  { key: 'critical',             label: 'Critical' },
  { key: 'high',                 label: 'High' },
  { key: 'standard',             label: 'Standard' },
  { key: 'low',                  label: 'Low' },
  { key: 'itp_drafted',          label: 'Drafted' },
  { key: 'submitted',            label: 'Submitted' },
  { key: 'under_review',         label: 'Under review' },
  { key: 'in_inspection',        label: 'In inspection' },
  { key: 'corrective_action',    label: 'Corrective action' },
  { key: 'failed',               label: 'Failed' },
  { key: 'released_for_use',     label: 'Released for use' },
  { key: 'archived',             label: 'Archived' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'signature',            label: 'Signature' },
  { key: 'cod_only',             label: 'COD-blocking' },
  { key: 'safety_only',          label: 'Safety-critical' },
  { key: 'hold_only',            label: 'Reg. hold point' },
];

type ActionKind =
  | 'submit' | 'open-review' | 'approve' | 'release'
  | 'schedule-inspection' | 'begin-inspection' | 'attend-witness'
  | 'record-result' | 'pass' | 'fail' | 'raise-corrective-action'
  | 're-inspect' | 'release-for-use' | 'archive'
  | 'reject' | 'withdraw' | 'void';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  itp_drafted:          'submit',
  submitted:            'open-review',
  under_review:         'approve',
  approved:             'release',
  released_to_site:     'schedule-inspection',
  inspection_scheduled: 'begin-inspection',
  in_inspection:        'attend-witness',
  witness_attended:     'record-result',
  result_recorded:      'pass',
  passed:               'release-for-use',
  failed:               'raise-corrective-action',
  corrective_action:    're-inspect',
  released_for_use:     'archive',
  archived:             null,
  rejected:             null,
  withdrawn:            null,
  voided:               null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit':                  'Submit (quality engineer)',
  'open-review':             'Open review (independent engineer)',
  'approve':                 'Approve (independent engineer)',
  'release':                 'Release to site (project manager)',
  'schedule-inspection':     'Schedule inspection (site supervisor)',
  'begin-inspection':        'Begin inspection (site supervisor)',
  'attend-witness':          'Witness attended (witness)',
  'record-result':           'Record result (independent engineer)',
  'pass':                    'Pass (independent engineer)',
  'fail':                    'Fail (independent engineer)',
  'raise-corrective-action': 'Raise corrective action (contractor)',
  're-inspect':              'Re-inspect (site supervisor)',
  'release-for-use':         'Release for use (commissioning engineer)',
  'archive':                 'Archive (project manager)',
  'reject':                  'Reject (independent engineer)',
  'withdraw':                'Withdraw (quality engineer)',
  'void':                    'Void (owner)',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  itp_drafted:          ['withdraw'],
  submitted:            ['reject', 'withdraw'],
  under_review:         ['reject', 'void'],
  approved:             ['void'],
  released_to_site:     ['void'],
  inspection_scheduled: ['void'],
  in_inspection:        ['fail', 'void'],
  witness_attended:     ['fail', 'void'],
  result_recorded:      ['fail', 'void'],
  passed:               ['void'],
  failed:               ['void'],
  corrective_action:    ['void'],
  released_for_use:     ['void'],
  archived:             [],
  rejected:             [],
  withdrawn:            [],
  voided:               [],
};

const DESTRUCTIVE: ActionKind[] = ['reject', 'withdraw', 'void', 'fail'];

const TERMINAL_STATES: ChainStatus[] = ['archived', 'rejected', 'withdrawn', 'voided'];

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

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

export function ItpChainTab() {
  const [rows, setRows] = useState<ItpRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<ItpRow | null>(null);
  const [events, setEvents] = useState<ItpEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ItpRow[] } & KpiSummary }>('/ipp/itp/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          archived_count: d.archived_count, rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count, voided_count: d.voided_count,
          breached: d.breached, reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          cod_count: d.cod_count, handover_count: d.handover_count,
          safety_count: d.safety_count, hold_count: d.hold_count,
          witness_count: d.witness_count, first_time_pass_count: d.first_time_pass_count,
          avg_quality_index: d.avg_quality_index,
          avg_days_in_court: d.avg_days_in_court,
          total_inspection_cost_zar: d.total_inspection_cost_zar,
          total_rework_cost_zar: d.total_rework_cost_zar,
          witness_attendance_rate: d.witness_attendance_rate,
          first_time_pass_rate: d.first_time_pass_rate,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ITP chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { itp: ItpRow; events: ItpEvent[] } }>(`/ipp/itp/chain/${id}`);
      if (res.data?.data?.itp) setSelected(res.data.data.itp);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ITP history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'open')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable_flag;
      if (filter === 'signature')   return r.signature_class_flag;
      if (filter === 'cod_only')    return r.blocks_commercial_operation === 1;
      if (filter === 'safety_only') return r.safety_critical_test === 1;
      if (filter === 'hold_only')   return r.regulator_hold_point === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ItpRow) => {
    try {
      let body: Record<string, unknown> = {};
      if (action === 'submit') {
        const note = window.prompt('Submission note (safety-critical tests cross NERSA inbox on submit):') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'open-review') {
        body = {};
      } else if (action === 'approve') {
        const reg = window.prompt('Regulator reference (COD-blocking approvals cross EVERY tier) — leave blank if not applicable:') || '';
        body = reg ? { approver_party: 'independent_engineer', regulator_ref: reg } : { approver_party: 'independent_engineer' };
      } else if (action === 'release') {
        const note = window.prompt('Release note (project manager):') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'schedule-inspection') {
        const note = window.prompt('Scheduled inspection window / date:') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'begin-inspection') {
        body = {};
      } else if (action === 'attend-witness') {
        const witness = window.prompt('Witness party (independent_engineer / regulator / lender):') || 'witness';
        body = { witness_party: witness, last_responder_party: 'witness' };
      } else if (action === 'record-result') {
        const result = window.prompt('Result text (pass / observations / non-conformance):');
        if (!result) return;
        body = { result_text: result, last_responder_party: 'independent_engineer' };
      } else if (action === 'pass') {
        const reg = window.prompt('Regulator reference (hold-point pass at high+critical crosses regulator) — leave blank if not applicable:') || '';
        body = reg ? { regulator_ref: reg } : {};
      } else if (action === 'fail') {
        const reason = window.prompt('Failure reason (safety OR COD failures cross regulator EVERY tier):');
        if (!reason) return;
        body = { reason_code: 'FAILED', result_text: reason };
      } else if (action === 'raise-corrective-action') {
        const note = window.prompt('Corrective action plan (contractor — root-cause + remediation steps):');
        if (!note) return;
        body = { narrative: note, last_responder_party: 'contractor' };
      } else if (action === 're-inspect') {
        const note = window.prompt('Re-inspection note (auto-increments reinspection count):') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'release-for-use') {
        const note = window.prompt('Release for use note (commissioning engineer):') || '';
        body = note ? { narrative: note, last_responder_party: 'commissioning_engineer' } : { last_responder_party: 'commissioning_engineer' };
      } else if (action === 'archive') {
        body = {};
      } else if (action === 'reject') {
        const reason = window.prompt('Rejection reason (independent engineer):');
        if (!reason) return;
        body = { rejected_reason: reason };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason (quality engineer):');
        if (!reason) return;
        body = { withdrawn_reason: reason };
      } else if (action === 'void') {
        const reason = window.prompt('Void reason — voiding with COD-blocking OR safety-critical crosses regulator EVERY tier:');
        if (!reason) return;
        body = { voided_reason: reason };
      }
      await api.post(`/ipp/itp/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">ITP &middot; Inspection &amp; test plan</h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 lifecycle for the forward-looking quality register of an IPP project — itp_drafted →
            submitted → under_review → approved → released_to_site → inspection_scheduled → in_inspection →
            witness_attended → result_recorded → &#123;passed → released_for_use → archived | failed →
            corrective_action → re_inspect → in_inspection rejoin&#125;, with reject / withdraw / void exception
            terminals. Beats Procore Quality, Aconex ITR, Bentley AssetWise, e-Builder ITR, Autodesk Construction
            Cloud Quality and Bluebeam Studio Quality via: tier RE-DERIVED on every transition from priority ×
            workflow class with FLOOR-AT-HIGH for blocks_handover_milestone / blocks_commercial_operation /
            safety_critical_test / regulator_hold_point; URGENT SLA polarity (safety-critical and COD-blocker
            = tightest); ball-in-court tracking; authority tiered site_supervisor → quality_engineer →
            project_manager → project_director; LIVE battery decoration (minutes_until_sla, ipp_quality_index
            0-130 vs industry baseline=100 with witness/first-time-pass/photo/root-cause bonuses, days_in_court,
            predicted_close_date_live, urgency_band). SIGNATURE regulator crossings (NERSA §C-5 + REIPPPP +
            OHSA s24 + IEC 61508): submit crosses EVERY tier on safety_critical_test; approve EVERY tier on
            blocks_commercial_operation; record_result(failed) EVERY tier on safety OR COD; void EVERY tier
            on COD OR safety; sla_breached EVERY tier on safety, high+critical on COD.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total"          value={kpis?.total ?? rows.length} />
        <Kpi label="Open"           value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Archived"       value={kpis?.archived_count ?? 0} tone="ok" />
        <Kpi label="Rejected"       value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Voided"         value={kpis?.voided_count ?? 0} tone={(kpis?.voided_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Signature"      value={kpis?.signature_count ?? 0} tone={(kpis?.signature_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="COD-blocking"   value={kpis?.cod_count ?? 0} tone={(kpis?.cod_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Safety-crit"    value={kpis?.safety_count ?? 0} tone={(kpis?.safety_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reg. hold"      value={kpis?.hold_count ?? 0} tone={(kpis?.hold_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable"     value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="IPP quality"    value={fmtNum(kpis?.avg_quality_index, 0)} />
        <Kpi label="Witness rate"   value={fmtPct(kpis?.witness_attendance_rate)} tone={(kpis?.witness_attendance_rate ?? 0) < 0.5 ? 'warn' : 'ok'} />
        <Kpi label="1st-time pass"  value={fmtPct(kpis?.first_time_pass_rate)} tone={(kpis?.first_time_pass_rate ?? 0) < 0.5 ? 'warn' : 'ok'} />
        <Kpi label="Inspection cost" value={fmtZar(kpis?.total_inspection_cost_zar)} />
        <Kpi label="Rework cost"    value={fmtZar(kpis?.total_rework_cost_zar)} tone={(kpis?.total_rework_cost_zar ?? 0) > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">No.</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / stage</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Ball in court</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urg</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Quality</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.current_tier];
                const ut = URGENCY_TONE[r.urgency_band] ?? URGENCY_TONE.green;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.itp_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#a06200]" title="Signature class (COD-blocker OR safety-critical)">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.project_name ?? ''} · ${r.construction_stage ?? ''}`}>
                      {r.project_name ?? '—'}
                      {r.construction_stage && <span className="text-[#4a5568]"> · {r.construction_stage}</span>}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{WORKFLOW_LABEL[r.workflow_class]}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.ball_in_court_party_live ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: ut.bg, color: ut.fg }}>
                        {ut.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={(r.ipp_quality_index_live ?? 0) >= 100 ? 'text-[#1f6b3a]' : 'text-[#9b1f1f]'}>
                        {fmtNum(r.ipp_quality_index_live, 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No ITP records match.</td></tr>
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
  row: ItpRow;
  events: ItpEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ItpRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.itp_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? '—'}{row.identified_at ? ` · ${row.identified_at.slice(0, 10)}` : ''}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {WORKFLOW_LABEL[row.workflow_class]}
                {row.contractor_name ? ` · ${row.contractor_name}` : ''}
                {row.construction_stage ? ` · ${row.construction_stage}` : ''}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live IPP quality battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Quality index" value={fmtNum(row.ipp_quality_index_live, 0)} bad={(row.ipp_quality_index_live ?? 0) < 100} hint="0-130 (industry baseline=100; +10 witness, +10 1st-time pass, photo/root-cause bonuses)" />
              <Metric label="Days open" value={String(row.days_open_live ?? 0)} />
              <Metric label="Days in court" value={String(row.days_in_court_live ?? 0)} bad={(row.days_in_court_live ?? 0) > 2} hint="Aging in current state" />
              <Metric label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
              <Metric label="Tier (live)" value={TIER_TONE[row.tier_live].label} bad={row.tier_live === 'critical' || row.tier_live === 'high'} hint="Re-derived every transition" />
              <Metric label="Urgency band" value={URGENCY_TONE[row.urgency_band]?.label ?? row.urgency_band} bad={row.urgency_band === 'red' || row.urgency_band === 'amber'} />
              <Metric label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived forward-path ETA" />
              <Metric label="Authority" value={authority} hint="Site supervisor → quality engineer → project manager → project director" />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Coverage flags (FLOOR-AT-HIGH)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Blocks handover" value={row.blocks_handover_milestone ? 'Yes' : 'No'} bad={!!row.blocks_handover_milestone} hint="REIPPPP handover milestone gate" />
              <Metric label="Blocks COD" value={row.blocks_commercial_operation ? 'Yes' : 'No'} bad={!!row.blocks_commercial_operation} hint="NERSA §C-5 — blocks commercial operation" />
              <Metric label="Safety-critical" value={row.safety_critical_test ? 'Yes' : 'No'} bad={!!row.safety_critical_test} hint="OHSA s24 + IEC 61508 safety-critical test" />
              <Metric label="Reg. hold point" value={row.regulator_hold_point ? 'Yes' : 'No'} bad={!!row.regulator_hold_point} hint="NERSA witnessed hold point" />
              <Metric label="Reinspections" value={String(row.reinspection_count ?? 0)} bad={(row.reinspection_count ?? 0) > 0} />
              <Metric label="Witness attended" value={row.witness_attended ? 'Yes' : 'No'} bad={!row.witness_attended} hint="+10 quality bonus" />
              <Metric label="1st-time pass" value={row.first_time_pass ? 'Yes' : 'No'} bad={!row.first_time_pass} hint="+10 quality bonus" />
              <Metric label="Photos" value={String(row.photo_evidence_count ?? 0)} hint="3+ photos = bonus quality" />
              <Metric label="Root cause" value={row.root_cause_documented ? 'Yes' : 'No'} hint="+5 quality" />
              <Metric label="Hold point ref" value={row.hold_point_ref ?? '—'} />
              <Metric label="Drawing ref" value={row.drawing_ref ?? '—'} />
              <Metric label="Spec ref" value={row.specification_ref ?? '—'} />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Quality economics</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Inspection cost" value={fmtZar(row.inspection_cost_zar)} hint="Total cost expended on inspection" />
              <Metric label="Rework cost" value={fmtZar(row.rework_cost_zar)} bad={(row.rework_cost_zar ?? 0) > 0} hint="Rework arising from failures / reinspection" />
              <Metric label="Total cost" value={fmtZar(((row.inspection_cost_zar ?? 0) + (row.rework_cost_zar ?? 0)))} bad={((row.rework_cost_zar ?? 0)) > 0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Workflow class"    value={WORKFLOW_LABEL[row.workflow_class]} />
            <Pair label="Priority"          value={row.priority_class} />
            <Pair label="Construction stage" value={row.construction_stage ?? '—'} />
            <Pair label="Identified at"     value={fmtDate(row.identified_at)} />
            <Pair label="Acceptance crit."  value={row.acceptance_criteria ?? '—'} />
            <Pair label="Hold point ref"    value={row.hold_point_ref ?? '—'} />
            <Pair label="Drawing ref"       value={row.drawing_ref ?? '—'} />
            <Pair label="Spec ref"          value={row.specification_ref ?? '—'} />
            <Pair label="Contractor"        value={row.contractor_name ?? '—'} />
            <Pair label="Facility"          value={row.facility_name ?? '—'} />
            <Pair label="Owner"             value={row.owner_party_name ?? '—'} />
            <Pair label="Witness party"     value={row.witness_party ?? '—'} />
            <Pair label="Last responder"    value={row.last_responder_party ?? '—'} />
            <Pair label="Requester"         value={row.requester_party ?? '—'} />
            <Pair label="Approver"          value={row.approver_party ?? '—'} />
            <Pair label="COD blocker ref"   value={row.cod_blocker_ref ?? '—'} />
            <Pair label="Handover blocker"  value={row.handover_blocker_ref ?? '—'} />
            <Pair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
            <Pair label="Submitted"         value={fmtDate(row.submitted_at)} />
            <Pair label="Under review"      value={fmtDate(row.under_review_at)} />
            <Pair label="Approved"          value={fmtDate(row.approved_at)} />
            <Pair label="Released to site"  value={fmtDate(row.released_to_site_at)} />
            <Pair label="Insp. scheduled"   value={fmtDate(row.inspection_scheduled_at)} />
            <Pair label="In inspection"     value={fmtDate(row.in_inspection_at)} />
            <Pair label="Witness attended"  value={fmtDate(row.witness_attended_at)} />
            <Pair label="Result recorded"   value={fmtDate(row.result_recorded_at)} />
            <Pair label="Passed"            value={fmtDate(row.passed_at)} />
            <Pair label="Failed"            value={fmtDate(row.failed_at)} />
            <Pair label="Corrective action" value={fmtDate(row.corrective_action_at)} />
            <Pair label="Released for use"  value={fmtDate(row.released_for_use_at)} />
            <Pair label="Archived"          value={fmtDate(row.archived_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA"               value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.title && <BasisBlock label="Title" tone="#1a3a5c" text={row.title} />}
          {row.narrative && <BasisBlock label="Narrative" tone="#1a3a5c" text={row.narrative} />}
          {row.result_text && <BasisBlock label="Result" tone="#1f6b3a" text={row.result_text} />}
          {row.rejected_reason && <BasisBlock label="Rejected reason" tone="#9b1f1f" text={row.rejected_reason} />}
          {row.voided_reason && <BasisBlock label="Voided reason" tone="#9b1f1f" text={row.voided_reason} />}
          {row.withdrawn_reason && <BasisBlock label="Withdrawn reason" tone="#8a4a00" text={row.withdrawn_reason} />}
        </section>

        {(primary || secondary.length > 0) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => onAct(a, row)}
                    className={
                      danger
                        ? 'rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                        : 'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]'
                    }
                  >
                    {ACTION_LABEL[a]}
                  </button>
                );
              })}
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

function Metric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${bad ? 'text-[#9b1f1f]' : 'text-[#0c2a4d]'}`}>{value}</div>
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
