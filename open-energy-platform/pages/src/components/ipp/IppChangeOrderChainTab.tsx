// Wave 117 — IPP Change Orders & Variations chain (P6).
//
// 12th and TARGET-CLOSING IPP-pure chain — CLOSES the Phase-A IPP-pure
// 12-chain target (W1/W10/W19/W20/W23/W27/W112/W113/W114/W115/W116/W117).
// SIXTH and final Phase-A world-class wave. Sibling of W112 schedule,
// W113 EVM, W114 doc control, W115 submittals, W116 RFIs. W117 owns the
// CHANGE ORDER LIFECYCLE — the formal route by which scope / cost /
// schedule changes are proposed, priced, negotiated, approved, scheduled,
// executed and closed out under FIDIC sec.13 / NEC4 sec.60-65 /
// AIA G701/G714 / CSI 01 26 00 / REIPPPP variations protocol / DMRE EPC
// change-control.
//
// Beats Procore Change Management / Aconex Cost Mgmt CRs / Oracle Aconex
// Variations / Autodesk Construction Cloud Cost / e-Builder Change Mgmt /
// Asite CRs / Coreworx Change / SAP S/4HANA EPC variations / Deltek
// Cobra change mgmt / InEight Control change mgmt. Each surfaces CRs as
// a list with status. W117 turns it into a 12-state P6 CR chain with
// INVERTED SLA polarity (HOURS), FLOOR-AT-MAJOR on 5 contextual flags
// (scope_baseline_change / regulatory_re_consent_required /
// schedule_impact_critical_path / lender_consent_required /
// safety_design_change), 4-step authority ladder
// (PM → engineer → owner_rep → IPP_CEO) and a 22-field LIVE CR battery.
//
// 12-state forward path + 4 branch states:
//   change_proposed → impact_assessed → cost_quoted → owner_review
//     → negotiated → approved → issued_for_execution → scheduled
//     → executing → executed → closed_out → archived (HARD terminal)
//   any non-terminal → reject → rejected (TERMINAL — out of scope)
//   pre-approval → void → void (TERMINAL — withdrawn before approval)
//   pre-execution → hold_resume → on_hold (SOFT)
//   review-touch → dispute → disputed (SOFT)
//
// INVERTED SLA polarity (HOURS) anchored on owner_review:
//   minor 168h / material 336h / major 720h / transformational 1080h.
//   (Larger CR-value gets MORE time for diligence — the polarity that
//   distinguishes W117 from the URGENT W116 RFI sister.)
//
// SIGNATURE Phase-A IPP regulator crossings:
//   * approve crosses EVERY tier when scope_baseline_change ||
//     regulatory_re_consent_required (W117 SIGNATURE SCOPE-BASELINE-
//     CHANGE-APPROVE hard line)
//   * reject crosses EVERY tier when cumulative_change_value_pct >= 15
//     (REIPPPP cumulative CR cap signal)
//   * dispute crosses major + transformational only
//   * close_out, archive, void, hold_resume never cross regulator
//   * sla_breached crosses major + transformational only

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'change_proposed' | 'impact_assessed' | 'cost_quoted' | 'owner_review'
  | 'negotiated' | 'approved' | 'issued_for_execution' | 'scheduled'
  | 'executing' | 'executed' | 'closed_out' | 'archived'
  | 'rejected' | 'void' | 'on_hold' | 'disputed';

type IcoTier = 'minor' | 'material' | 'major' | 'transformational';
type IcoUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'PM' | 'engineer' | 'owner_rep' | 'IPP_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type CapBand = 'clear' | 'watch' | 'warning' | 'breach';

interface IcoRow {
  id: string;
  change_order_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  contract_ref: string | null;
  contract_value_zar: number;
  rfi_ref: string | null;
  submittal_ref: string | null;
  document_control_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  change_type: string | null;
  change_class: string | null;
  initiator_role: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  spec_section: string | null;
  csi_section: string | null;
  basis_clause: string | null;
  scope_summary_short: string | null;
  scope_summary_long: string | null;
  proposed_resolution: string | null;
  pm_name: string | null;
  engineer_name: string | null;
  owner_rep_name: string | null;
  ceo_name: string | null;
  current_ball_in_court_party: string | null;
  last_actor_party: string | null;
  scope_baseline_change: number;
  regulatory_re_consent_required: number;
  schedule_impact_critical_path: number;
  lender_consent_required: number;
  safety_design_change: number;
  change_value_zar: number;
  schedule_impact_days: number;
  eac_delta_zar: number;
  cumulative_change_value_zar: number;
  cumulative_change_value_pct: number;
  cumulative_cap_band: CapBand | null;
  current_tier: IcoTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  change_order_health_band: HealthBand | null;
  change_order_completeness_index: number;
  change_order_age_days: number;
  days_to_critical_path_recovery: number | null;
  regulator_filing_window_hours: number;
  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  hold_reason: string | null;
  dispute_reason: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  change_proposed_at: string | null;
  impact_assessed_at: string | null;
  cost_quoted_at: string | null;
  owner_review_at: string | null;
  negotiated_at: string | null;
  approved_at: string | null;
  issued_for_execution_at: string | null;
  scheduled_at: string | null;
  executing_at: string | null;
  executed_at: string | null;
  closed_out_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  void_at: string | null;
  on_hold_at: string | null;
  disputed_at: string | null;
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
  // Decorated (LIVE 22-field battery)
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: IcoUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  change_order_completeness_index_live?: number;
  change_order_health_band_live?: HealthBand;
  change_order_age_days_live?: number;
  days_to_critical_path_recovery_live?: number | null;
  cumulative_cap_band_live?: CapBand;
  eac_delta_sign_live?: 'positive' | 'negative' | 'flat';
  bridges_to_rfi_chain_live?: boolean;
  bridges_to_submittal_chain_live?: boolean;
  bridges_to_document_control_chain_live?: boolean;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
}

interface IcoEvent {
  id: string;
  change_order_id: string;
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
  change_proposed:       { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  impact_assessed:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Impact assessed' },
  cost_quoted:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Cost quoted' },
  owner_review:          { bg: '#fff4d6', fg: '#a06200', label: 'Owner review' },
  negotiated:            { bg: '#fff4d6', fg: '#a06200', label: 'Negotiated' },
  approved:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  issued_for_execution:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Issued' },
  scheduled:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Scheduled' },
  executing:             { bg: '#fff4d6', fg: '#a06200', label: 'Executing' },
  executed:              { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Executed' },
  closed_out:            { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed out' },
  archived:              { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  rejected:              { bg: '#7a0e0e', fg: '#fff',    label: 'Rejected' },
  void:                  { bg: '#3a3a3a', fg: '#fff',    label: 'Void' },
  on_hold:               { bg: '#e3e7ec', fg: '#445',    label: 'On hold' },
  disputed:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
};

const TIER_TONE: Record<IcoTier, { bg: string; fg: string; label: string }> = {
  minor:             { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  material:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Material' },
  major:             { bg: '#fff4d6', fg: '#a06200', label: 'Major' },
  transformational:  { bg: '#7a0e0e', fg: '#fff',    label: 'Transformational' },
};

const URGENCY_TONE: Record<IcoUrgency, { bg: string; fg: string; label: string }> = {
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

const CAP_TONE: Record<CapBand, { bg: string; fg: string; label: string }> = {
  clear:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Cap clear (<5%)' },
  watch:    { bg: '#fff4d6', fg: '#a06200', label: 'Cap watch (5-10%)' },
  warning:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Cap warning (10-15%)' },
  breach:   { bg: '#7a0e0e', fg: '#fff',    label: 'Cap BREACH (>=15%)' },
};

// Row 1: action / lifecycle pills (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',            label: 'Active' },
  { key: 'all',               label: 'All' },
  { key: 'reportable',        label: 'Reportable' },
  { key: 'breached',          label: 'SLA breached' },
  { key: 'owner_review',      label: 'Owner review' },
  { key: 'approved',          label: 'Approved' },
  { key: 'executing',         label: 'Executing' },
  { key: 'scope_baseline',    label: 'Scope-baseline' },
  { key: 'regulatory_consent',label: 'Regulatory consent' },
  { key: 'critical_path',     label: 'Critical path' },
  { key: 'lender_consent',    label: 'Lender consent' },
  { key: 'safety_design',     label: 'Safety design' },
  { key: 'cap_warning',       label: 'Cap warning' },
  { key: 'cap_breach',        label: 'Cap BREACH' },
  { key: 'health_red',        label: 'Health red' },
  { key: 'health_critical',   label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'change_proposed',       label: 'Proposed' },
  { key: 'impact_assessed',       label: 'Impact assessed' },
  { key: 'cost_quoted',           label: 'Cost quoted' },
  { key: 'owner_review',          label: 'Owner review' },
  { key: 'negotiated',            label: 'Negotiated' },
  { key: 'approved',              label: 'Approved' },
  { key: 'issued_for_execution',  label: 'Issued' },
  { key: 'scheduled',             label: 'Scheduled' },
  { key: 'executing',             label: 'Executing' },
  { key: 'executed',              label: 'Executed' },
  { key: 'closed_out',            label: 'Closed' },
  { key: 'archived',              label: 'Archived' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'void',                  label: 'Void' },
  { key: 'on_hold',               label: 'On hold' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'minor',                 label: 'Tier: Minor' },
  { key: 'material',              label: 'Tier: Material' },
  { key: 'major',                 label: 'Tier: Major' },
  { key: 'transformational',      label: 'Tier: Transformational' },
];

type ActionKind =
  | 'assess-impact' | 'quote-cost' | 'submit-for-review' | 'negotiate'
  | 'approve' | 'issue' | 'schedule' | 'commence-execution'
  | 'complete-execution' | 'close-out' | 'archive'
  | 'reject' | 'void' | 'hold-resume' | 'dispute';

const ACTION_FOR_STATE: Partial<Record<ChainStatus, ActionKind>> = {
  change_proposed:        'assess-impact',
  impact_assessed:        'quote-cost',
  cost_quoted:            'submit-for-review',
  owner_review:           'negotiate',
  negotiated:             'approve',
  approved:               'issue',
  issued_for_execution:   'schedule',
  scheduled:              'commence-execution',
  executing:              'complete-execution',
  executed:               'close-out',
  closed_out:             'archive',
  on_hold:                'hold-resume',
  disputed:               'negotiate',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'assess-impact':        'Assess impact (Engineer)',
  'quote-cost':           'Quote cost (Engineer)',
  'submit-for-review':    'Submit for owner review (PM — anchors INVERTED SLA)',
  'negotiate':            'Negotiate (Owner Rep)',
  'approve':              'Approve (IPP CEO — SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE: crosses regulator EVERY tier when scope_baseline_change OR regulatory_re_consent_required)',
  'issue':                'Issue for execution (IPP CEO)',
  'schedule':             'Schedule (IPP CEO)',
  'commence-execution':   'Commence execution (IPP CEO)',
  'complete-execution':   'Complete execution (IPP CEO)',
  'close-out':            'Close out (IPP CEO)',
  'archive':              'Archive (IPP CEO — HARD terminal)',
  'reject':               'Reject (Owner Rep — crosses regulator EVERY tier when cumulative CR pct >= 15%)',
  'void':                 'Void (PM — pre-approval pull)',
  'hold-resume':          'Hold / resume (PM — soft pause)',
  'dispute':              'Raise dispute (Owner Rep — crosses regulator major + transformational only)',
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
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}R${(abs / 1_000_000_000).toFixed(2)}bn`;
  if (abs >= 1_000_000)     return `${sign}R${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000)         return `${sign}R${(abs / 1_000).toFixed(1)}k`;
  return `${sign}R${abs.toFixed(0)}`;
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  impact_assessed_count: number;
  cost_quoted_count: number;
  owner_review_count: number;
  negotiated_count: number;
  approved_count: number;
  issued_count: number;
  scheduled_count: number;
  executing_count: number;
  executed_count: number;
  closed_out_count: number;
  archived_count: number;
  rejected_count: number;
  void_count: number;
  on_hold_count: number;
  disputed_count: number;
  transformational_count: number;
  major_count: number;
  breached: number;
  reportable_total: number;
  scope_baseline_count: number;
  regulatory_consent_count: number;
  critical_path_count: number;
  lender_consent_count: number;
  safety_design_count: number;
  rfi_bridged_count: number;
  submittal_bridged_count: number;
  document_control_bridged_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  cod_bridged_count: number;
  completeness_avg: number;
  change_value_zar_total: number;
  cumulative_value_zar_total: number;
  schedule_impact_days_total: number;
  eac_delta_zar_total: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0, proposed_count: 0, impact_assessed_count: 0,
  cost_quoted_count: 0, owner_review_count: 0, negotiated_count: 0,
  approved_count: 0, issued_count: 0, scheduled_count: 0, executing_count: 0,
  executed_count: 0, closed_out_count: 0, archived_count: 0,
  rejected_count: 0, void_count: 0, on_hold_count: 0, disputed_count: 0,
  transformational_count: 0, major_count: 0, breached: 0, reportable_total: 0,
  scope_baseline_count: 0, regulatory_consent_count: 0, critical_path_count: 0,
  lender_consent_count: 0, safety_design_count: 0, rfi_bridged_count: 0,
  submittal_bridged_count: 0, document_control_bridged_count: 0,
  schedule_bridged_count: 0, evm_bridged_count: 0,
  procurement_bridged_count: 0, cod_bridged_count: 0,
  completeness_avg: 0, change_value_zar_total: 0,
  cumulative_value_zar_total: 0, schedule_impact_days_total: 0,
  eac_delta_zar_total: 0,
};

export function IppChangeOrderChainTab() {
  const [rows, setRows] = useState<IcoRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<IcoRow | null>(null);
  const [events, setEvents] = useState<IcoEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IcoRow[] } & KpiSummary }>('/ipp/change-orders/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          impact_assessed_count: data.impact_assessed_count || 0,
          cost_quoted_count: data.cost_quoted_count || 0,
          owner_review_count: data.owner_review_count || 0,
          negotiated_count: data.negotiated_count || 0,
          approved_count: data.approved_count || 0,
          issued_count: data.issued_count || 0,
          scheduled_count: data.scheduled_count || 0,
          executing_count: data.executing_count || 0,
          executed_count: data.executed_count || 0,
          closed_out_count: data.closed_out_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          void_count: data.void_count || 0,
          on_hold_count: data.on_hold_count || 0,
          disputed_count: data.disputed_count || 0,
          transformational_count: data.transformational_count || 0,
          major_count: data.major_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          scope_baseline_count: data.scope_baseline_count || 0,
          regulatory_consent_count: data.regulatory_consent_count || 0,
          critical_path_count: data.critical_path_count || 0,
          lender_consent_count: data.lender_consent_count || 0,
          safety_design_count: data.safety_design_count || 0,
          rfi_bridged_count: data.rfi_bridged_count || 0,
          submittal_bridged_count: data.submittal_bridged_count || 0,
          document_control_bridged_count: data.document_control_bridged_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          completeness_avg: data.completeness_avg || 0,
          change_value_zar_total: data.change_value_zar_total || 0,
          cumulative_value_zar_total: data.cumulative_value_zar_total || 0,
          schedule_impact_days_total: data.schedule_impact_days_total || 0,
          eac_delta_zar_total: data.eac_delta_zar_total || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Change Order chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: IcoRow; events: IcoEvent[] } }>(`/ipp/change-orders/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                return true;
      if (filter === 'active')             return !r.is_terminal;
      if (filter === 'reportable')         return r.is_reportable_flag;
      if (filter === 'breached')           return r.sla_breached_live;
      if (filter === 'scope_baseline')     return !!r.scope_baseline_change;
      if (filter === 'regulatory_consent') return !!r.regulatory_re_consent_required;
      if (filter === 'critical_path')      return !!r.schedule_impact_critical_path;
      if (filter === 'lender_consent')     return !!r.lender_consent_required;
      if (filter === 'safety_design')      return !!r.safety_design_change;
      if (filter === 'cap_warning')        return r.cumulative_cap_band_live === 'warning';
      if (filter === 'cap_breach')         return r.cumulative_cap_band_live === 'breach';
      if (filter === 'health_red')         return r.change_order_health_band_live === 'red';
      if (filter === 'health_critical')    return r.change_order_health_band_live === 'critical';
      if (['minor', 'material', 'major', 'transformational'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: IcoRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'assess-impact') {
        const eng = window.prompt('Engineer name:', row.engineer_name ?? '');
        if (eng) body.engineer_name = eng;
        const sched = window.prompt('Schedule impact (days):', String(row.schedule_impact_days ?? 0));
        if (sched !== null) body.schedule_impact_days = Number(sched);
      } else if (action === 'quote-cost') {
        const val = window.prompt('Change value (ZAR):', String(row.change_value_zar ?? 0));
        if (val === null) return;
        body.change_value_zar = Number(val);
        const eac = window.prompt('EAC delta (ZAR, can be negative):', String(row.eac_delta_zar ?? 0));
        if (eac !== null) body.eac_delta_zar = Number(eac);
      } else if (action === 'submit-for-review') {
        const ownerRep = window.prompt('Owner Rep name (anchors INVERTED SLA on owner_review):', row.owner_rep_name ?? '');
        if (ownerRep) body.owner_rep_name = ownerRep;
      } else if (action === 'negotiate') {
        const note = window.prompt('Negotiation note (Owner Rep):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'approve') {
        const ceo = window.prompt('IPP CEO name. NOTE: W117 SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE — crosses regulator EVERY tier when scope_baseline_change OR regulatory_re_consent_required.', row.ceo_name ?? '');
        if (!ceo) return;
        body.ceo_name = ceo;
      } else if (action === 'issue') {
        const note = window.prompt('Issue-for-execution note (IPP CEO):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'schedule') {
        const note = window.prompt('Schedule note (IPP CEO):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'commence-execution') {
        const note = window.prompt('Commence execution note (IPP CEO):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'complete-execution') {
        const note = window.prompt('Complete execution note (IPP CEO):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'close-out') {
        const note = window.prompt('Close-out note (IPP CEO):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive note (IPP CEO — HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject') {
        const reason = window.prompt('Reject reason (required). NOTE: W117 — crosses regulator EVERY tier when cumulative_change_value_pct >= 15% (REIPPPP cumulative CR cap).', row.reject_reason ?? '');
        if (!reason) return;
        body.reject_reason = reason;
      } else if (action === 'void') {
        const reason = window.prompt('Void reason (PM — pre-approval pull only):', row.void_reason ?? '');
        if (!reason) return;
        body.void_reason = reason;
      } else if (action === 'hold-resume') {
        const reason = window.prompt('Hold / resume reason (PM — soft pause; toggles on_hold):', row.hold_reason ?? '');
        if (!reason) return;
        body.hold_reason = reason;
      } else if (action === 'dispute') {
        const reason = window.prompt('Dispute reason (Owner Rep). NOTE: crosses regulator major + transformational only.', row.dispute_reason ?? '');
        if (!reason) return;
        body.dispute_reason = reason;
      }
      await api.post(`/ipp/change-orders/chain/${row.id}/${action}`, body);
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
            IPP Change Orders &amp; Variations &mdash; FIDIC {'§13'} + NEC4 {'§60-65'} + AIA G701/G714 + CSI 01 26 00 + REIPPPP variations + DMRE EPC change-control
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 CR chain:
            proposed {'→'} impact assessed {'→'} cost quoted {'→'} owner review {'→'} negotiated {'→'} approved {'→'}
            issued {'→'} scheduled {'→'} executing {'→'} executed {'→'} closed out {'→'} archived (HARD terminal),
            with rejected / void terminals + on_hold / disputed soft branches.
            INVERTED SLA polarity (HOURS) on owner_review: minor 168h, material 336h, major 720h, transformational 1080h
            (<em>larger CR-value gets MORE time for diligence</em>).
            FLOOR-AT-MAJOR on ANY one of 5 contextual flags
            (scope_baseline, regulatory consent, critical-path, lender consent, safety design); 2+ flags lifts to transformational.
            4-step authority ladder: PM {'→'} engineer {'→'} owner_rep {'→'} IPP_CEO.
            SIGNATURE: <strong>approve crosses regulator EVERY tier when scope_baseline_change OR regulatory_re_consent_required</strong>
            (W117 SCOPE-BASELINE-CHANGE-APPROVE hard line); reject crosses EVERY tier when cumulative CR pct {'≥'} 15% (REIPPPP cap);
            dispute crosses major + transformational only; SLA breach crosses major + transformational only;
            close_out / archive / void / hold_resume never cross regulator.
            6 bridges: W116 RFIs, W115 submittals, W114 doc-control, W112 schedule, W113 EVM, W19 procurement, W20 COD.
            Nightly cumulative-pct + cap-band refresh at 00:40 UTC keeps cap_band / age / completeness / health live.
          </p>
        </div>
      </header>

      {/* 8-card KPI strip — action-LEFT (most actionable first) */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Active"            value={kpis.active_count}            tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Owner review"      value={kpis.owner_review_count}      tone={kpis.owner_review_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Executing"         value={kpis.executing_count}         tone={kpis.executing_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Approved"          value={kpis.approved_count}          tone={kpis.approved_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Transformational"  value={kpis.transformational_count}  tone={kpis.transformational_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"      value={kpis.breached}                tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable"        value={kpis.reportable_total}        tone={kpis.reportable_total > 0 ? 'bad' : 'ok'} />
        <Kpi label="Total"             value={kpis.total} />
      </div>

      {/* Sub-KPI strip — flag-count + value-totals + bridge counts */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Scope-baseline: <span className="font-semibold text-[#9b1f1f]">{kpis.scope_baseline_count}</span></span>
        <span>Reg consent: <span className="font-semibold text-[#9b1f1f]">{kpis.regulatory_consent_count}</span></span>
        <span>Critical-path: <span className="font-semibold text-[#9b1f1f]">{kpis.critical_path_count}</span></span>
        <span>Lender consent: <span className="font-semibold text-[#a06200]">{kpis.lender_consent_count}</span></span>
        <span>Safety design: <span className="font-semibold text-[#9b1f1f]">{kpis.safety_design_count}</span></span>
        <span>Major: <span className="font-semibold text-[#a06200]">{kpis.major_count}</span></span>
        <span>Proposed: <span className="font-semibold text-[#445]">{kpis.proposed_count}</span></span>
        <span>Impact assessed: <span className="font-semibold text-[#1a3a5c]">{kpis.impact_assessed_count}</span></span>
        <span>Cost quoted: <span className="font-semibold text-[#1a3a5c]">{kpis.cost_quoted_count}</span></span>
        <span>Negotiated: <span className="font-semibold text-[#a06200]">{kpis.negotiated_count}</span></span>
        <span>Issued: <span className="font-semibold text-[#1f6b3a]">{kpis.issued_count}</span></span>
        <span>Scheduled: <span className="font-semibold text-[#1f6b3a]">{kpis.scheduled_count}</span></span>
        <span>Executed: <span className="font-semibold text-[#1f5b3a]">{kpis.executed_count}</span></span>
        <span>Closed: <span className="font-semibold text-[#1f5b3a]">{kpis.closed_out_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Rejected: <span className="font-semibold text-[#9b1f1f]">{kpis.rejected_count}</span></span>
        <span>Void: <span className="font-semibold text-[#6b7685]">{kpis.void_count}</span></span>
        <span>On hold: <span className="font-semibold text-[#6b7685]">{kpis.on_hold_count}</span></span>
        <span>Disputed: <span className="font-semibold text-[#9b1f1f]">{kpis.disputed_count}</span></span>
        <span>Change value: <span className="font-semibold text-[#1a3a5c]">{fmtZar(kpis.change_value_zar_total)}</span></span>
        <span>Cumulative: <span className="font-semibold text-[#9b1f1f]">{fmtZar(kpis.cumulative_value_zar_total)}</span></span>
        <span>EAC {'Δ'}: <span className="font-semibold text-[#9b1f1f]">{fmtZar(kpis.eac_delta_zar_total)}</span></span>
        <span>Sched days: <span className="font-semibold text-[#a06200]">{kpis.schedule_impact_days_total}</span></span>
        <span>Completeness avg: <span className="font-semibold text-[#1a3a5c]">{kpis.completeness_avg}/130</span></span>
        <span>W116 (RFI): <span className="font-semibold text-[#1a3a5c]">{kpis.rfi_bridged_count}</span></span>
        <span>W115 (sub): <span className="font-semibold text-[#1a3a5c]">{kpis.submittal_bridged_count}</span></span>
        <span>W114 (doc): <span className="font-semibold text-[#1a3a5c]">{kpis.document_control_bridged_count}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">CR #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Scope summary</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Age (d)</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Cap band</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Change value</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Cum %</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.change_order_health_band_live ?? 'green'];
                const cap = CAP_TONE[r.cumulative_cap_band_live ?? r.cumulative_cap_band ?? 'clear'];
                const ageDays = r.change_order_age_days_live ?? r.change_order_age_days ?? 0;
                const cumPct = r.cumulative_change_value_pct ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.change_order_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="text-[11px] font-medium">{r.project_name ?? r.project_id}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {fmtMw(r.project_capacity_mw)}
                        {r.scope_baseline_change ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">SCP</span> : null}
                        {r.regulatory_re_consent_required ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span> : null}
                        {r.schedule_impact_critical_path ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">CP</span> : null}
                        {r.lender_consent_required ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">LDR</span> : null}
                        {r.safety_design_change ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">SFTY</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.package_code ?? r.discipline ?? '-'}</div>
                      <div className="text-[10px] text-[#6b7685] truncate max-w-[260px]">{r.scope_summary_short ?? r.title ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[#1a3a5c]">
                      <span className={ageDays >= 30 ? 'font-bold text-[#9b1f1f]' : ageDays >= 14 ? 'font-bold text-[#a06200]' : ''}>{ageDays}</span>
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
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cap.bg, color: cap.fg }}>
                        {cap.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.change_value_zar >= 50_000_000 ? 'text-[#9b1f1f] font-semibold' : r.change_value_zar >= 5_000_000 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {fmtZar(r.change_value_zar)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${cumPct >= 15 ? 'text-[#9b1f1f] font-semibold' : cumPct >= 10 ? 'text-[#a06200] font-semibold' : 'text-[#4a5568]'}`}>
                      {cumPct.toFixed(2)}%
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No change orders match.</td></tr>
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
  row: IcoRow;
  events: IcoEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: IcoRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const completeness = row.change_order_completeness_index_live ?? row.change_order_completeness_index;

  // Overflow actions allowed across non-terminal states.
  const PRE_APPROVAL: ChainStatus[] = [
    'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review', 'negotiated',
  ];
  const REVIEW_TOUCH: ChainStatus[] = [
    'impact_assessed', 'cost_quoted', 'owner_review', 'negotiated', 'approved',
  ];
  const PRE_EXECUTION: ChainStatus[] = [
    'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review',
    'negotiated', 'approved', 'issued_for_execution', 'scheduled',
  ];
  const REJECTABLE: ChainStatus[] = [
    'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review', 'negotiated',
  ];

  const canVoid             = PRE_APPROVAL.includes(row.chain_status);
  const canDispute          = REVIEW_TOUCH.includes(row.chain_status);
  const canHoldResume       = PRE_EXECUTION.includes(row.chain_status) || row.chain_status === 'on_hold';
  const canReject           = REJECTABLE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[896px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.change_order_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? row.project_id} &mdash; {fmtMw(row.project_capacity_mw)}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} Class <span className="font-mono text-[#1a3a5c]">{row.change_class ?? '-'}</span>
                {' '}{'•'} Age <span className="font-mono text-[#1a3a5c]">{row.change_order_age_days_live ?? row.change_order_age_days}d</span>
                {' '}{'•'} Escalations <span className="font-mono text-[#1a3a5c]">{row.escalation_level}</span>
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
            {row.change_order_health_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: HEALTH_TONE[row.change_order_health_band_live].bg, color: HEALTH_TONE[row.change_order_health_band_live].fg }}>
                Health: {HEALTH_TONE[row.change_order_health_band_live].label}
              </span>
            )}
            {row.cumulative_cap_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: CAP_TONE[row.cumulative_cap_band_live].bg, color: CAP_TONE[row.cumulative_cap_band_live].fg }}>
                {CAP_TONE[row.cumulative_cap_band_live].label}
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
            {row.scope_baseline_change ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Scope baseline</span>
            ) : null}
            {row.regulatory_re_consent_required ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Regulatory consent</span>
            ) : null}
            {row.schedule_impact_critical_path ? (
              <span className="inline-block rounded bg-[#9b1f1f] px-2 py-0.5 font-semibold text-white">Critical path</span>
            ) : null}
            {row.lender_consent_required ? (
              <span className="inline-block rounded bg-[#a06200] px-2 py-0.5 font-semibold text-white">Lender consent</span>
            ) : null}
            {row.safety_design_change ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Safety design</span>
            ) : null}
          </div>
        </header>

        <div className="p-5 space-y-4">
          {/* LIVE 22-field battery */}
          <Section title="LIVE battery (22 fields, re-computed every fetch)">
            <Grid>
              <Field label="Tier (re-derived)"          value={TIER_TONE[row.current_tier].label} tone={row.current_tier === 'transformational' ? 'bad' : row.current_tier === 'major' ? 'warn' : 'ok'} />
              <Field label="Floor flags"                value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 2 ? 'bad' : (row.floor_flag_count_live || 0) >= 1 ? 'warn' : 'ok'} />
              <Field label="Authority required"         value={row.authority_required_live ?? '-'} />
              <Field label="Completeness"               value={`${completeness} / 130`} tone={completeness >= 90 ? 'ok' : completeness >= 60 ? 'warn' : 'bad'} />
              <Field label="Health band"                value={row.change_order_health_band_live ?? '-'} />
              <Field label="Urgency"                    value={row.urgency_band_live ?? '-'} />
              <Field label="Cap band (cumulative %)"    value={CAP_TONE[row.cumulative_cap_band_live ?? row.cumulative_cap_band ?? 'clear'].label} tone={row.cumulative_cap_band_live === 'breach' ? 'bad' : row.cumulative_cap_band_live === 'warning' ? 'warn' : 'ok'} />
              <Field label="SLA hours remaining"        value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"                 value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Regulator filing window"    value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
              <Field label="CR age (live)"              value={`${row.change_order_age_days_live ?? row.change_order_age_days}d`} tone={(row.change_order_age_days_live ?? row.change_order_age_days) >= 30 ? 'bad' : (row.change_order_age_days_live ?? row.change_order_age_days) >= 14 ? 'warn' : 'ok'} />
              <Field label="Days to CP recovery"        value={row.days_to_critical_path_recovery_live != null ? `${row.days_to_critical_path_recovery_live}d` : '-'} tone={row.days_to_critical_path_recovery_live != null && row.days_to_critical_path_recovery_live > 0 ? 'bad' : 'ok'} />
              <Field label="Change value"               value={fmtZar(row.change_value_zar)} tone={row.change_value_zar >= 50_000_000 ? 'bad' : row.change_value_zar >= 5_000_000 ? 'warn' : 'ok'} />
              <Field label="EAC delta"                  value={fmtZar(row.eac_delta_zar)} tone={row.eac_delta_sign_live === 'positive' ? 'bad' : row.eac_delta_sign_live === 'negative' ? 'ok' : 'warn'} />
              <Field label="Cumulative CR value"        value={fmtZar(row.cumulative_change_value_zar)} tone={row.cumulative_change_value_pct >= 15 ? 'bad' : row.cumulative_change_value_pct >= 10 ? 'warn' : 'ok'} />
              <Field label="Cumulative CR %"            value={`${row.cumulative_change_value_pct.toFixed(2)}%`} tone={row.cumulative_change_value_pct >= 15 ? 'bad' : row.cumulative_change_value_pct >= 10 ? 'warn' : 'ok'} />
              <Field label="Schedule impact (d)"        value={`${row.schedule_impact_days}d`} tone={row.schedule_impact_days >= 14 ? 'bad' : row.schedule_impact_days > 0 ? 'warn' : 'ok'} />
              <Field label="Contract value"             value={fmtZar(row.contract_value_zar)} />
              <Field label="Hash chain position"        value={String(row.hash_chain_position)} />
              <Field label="Merkle segment (W118)"      value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
              <Field label="Last actor"                 value={row.last_actor_party ?? '-'} />
              <Field label="Ball-in-court"              value={row.current_ball_in_court_party ?? '-'} />
            </Grid>
          </Section>

          {/* CR identity */}
          <Section title="CR identity (FIDIC §13 + NEC4 §60-65 + AIA G701/G714 + CSI 01 26 00)">
            <Grid>
              <Field label="Change type"        value={row.change_type ?? '-'} />
              <Field label="Change class"       value={row.change_class ?? '-'} />
              <Field label="Initiator role"     value={row.initiator_role ?? '-'} />
              <Field label="Discipline"         value={row.discipline ?? '-'} />
              <Field label="Package code"       value={row.package_code ?? '-'} />
              <Field label="CSI section"        value={row.csi_section ?? '-'} />
              <Field label="Spec section"       value={row.spec_section ?? '-'} />
              <Field label="Drawing number"     value={row.drawing_number ?? '-'} />
              <Field label="Basis clause"       value={row.basis_clause ?? '-'} />
              <Field label="PM"                 value={row.pm_name ?? '-'} />
              <Field label="Engineer"           value={row.engineer_name ?? '-'} />
              <Field label="Owner Rep"          value={row.owner_rep_name ?? '-'} />
              <Field label="IPP CEO"            value={row.ceo_name ?? '-'} />
              <Field label="Contract ref"       value={row.contract_ref ?? '-'} />
            </Grid>
          </Section>

          {/* Bridges */}
          <Section title="7-bridge architecture (W116 / W115 / W114 / W112 / W113 / W19 / W20)">
            <Grid>
              <Field label="W116 RFI ref"           value={row.rfi_ref ?? '-'}              tone={row.bridges_to_rfi_chain_live ? 'ok' : 'warn'} />
              <Field label="W115 submittal ref"     value={row.submittal_ref ?? '-'}        tone={row.bridges_to_submittal_chain_live ? 'ok' : 'warn'} />
              <Field label="W114 doc-control ref"   value={row.document_control_ref ?? '-'} tone={row.bridges_to_document_control_chain_live ? 'ok' : 'warn'} />
              <Field label="W112 schedule ref"      value={row.schedule_ref ?? '-'}         tone={row.bridges_to_schedule_chain_live ? 'ok' : 'warn'} />
              <Field label="W113 EVM ref"           value={row.evm_ref ?? '-'}              tone={row.bridges_to_evm_chain_live ? 'ok' : 'warn'} />
              <Field label="W19 procurement ref"    value={row.procurement_ref ?? '-'}      tone={row.bridges_to_procurement_chain_live ? 'ok' : 'warn'} />
              <Field label="W20 COD ref"            value={row.cod_ref ?? '-'}              tone={row.bridges_to_cod_chain_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"    value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"          value={row.regulator_ref ?? '-'} />
              <Field label="Regulator crossed at"   value={fmtDate(row.regulator_crossed_at)} tone={row.regulator_crossed_at ? 'bad' : 'ok'} />
            </Grid>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5) — FLOOR-AT-MAJOR (1+) / FLOOR-AT-TRANSFORMATIONAL (2+)">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="Scope baseline change"        on={!!row.scope_baseline_change} />
              <FlagPill label="Regulatory re-consent"        on={!!row.regulatory_re_consent_required} />
              <FlagPill label="Schedule impact CP"           on={!!row.schedule_impact_critical_path} />
              <FlagPill label="Lender consent required"     on={!!row.lender_consent_required} />
              <FlagPill label="Safety design change"         on={!!row.safety_design_change} />
            </div>
          </Section>

          {/* Scope */}
          {(row.scope_summary_short || row.scope_summary_long || row.proposed_resolution) && (
            <Section title="Scope / resolution">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.scope_summary_short && <div><strong>Short:</strong> {row.scope_summary_short}</div>}
                {row.scope_summary_long && <div><strong>Long:</strong> {row.scope_summary_long}</div>}
                {row.proposed_resolution && <div><strong>Proposed resolution:</strong> {row.proposed_resolution}</div>}
              </div>
            </Section>
          )}

          {/* Reasons */}
          {(row.reject_reason || row.void_reason || row.hold_reason || row.dispute_reason || row.reason_code) && (
            <Section title="Reasons / narrative">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.reason_code && <div><strong>Reason code:</strong> {row.reason_code}</div>}
                {row.reject_reason && <div><strong>Reject reason:</strong> {row.reject_reason}</div>}
                {row.void_reason && <div><strong>Void reason:</strong> {row.void_reason}</div>}
                {row.hold_reason && <div><strong>Hold reason:</strong> {row.hold_reason}</div>}
                {row.dispute_reason && <div><strong>Dispute reason:</strong> {row.dispute_reason}</div>}
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
              {canHoldResume && (
                <ActionButton tone="warn" onClick={() => onAct('hold-resume', row)}>
                  {ACTION_LABEL['hold-resume']}
                </ActionButton>
              )}
              {canDispute && (
                <ActionButton tone="warn" onClick={() => onAct('dispute', row)}>
                  {ACTION_LABEL['dispute']}
                </ActionButton>
              )}
              {canReject && (
                <ActionButton tone="danger" onClick={() => onAct('reject', row)}>
                  {ACTION_LABEL['reject']}
                </ActionButton>
              )}
              {canVoid && (
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
