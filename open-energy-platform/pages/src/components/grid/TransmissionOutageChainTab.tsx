// Wave 110 - Grid Transmission Network Outage Coordination & N-1 Security
// Assessment chain tab. 11th Grid chain. SO-initiated EHV / HV
// transmission line + substation outage windows with N-1 contingency
// security assessment + reliability-committee approval + real-time
// supervision + return-to-service verification. Distinct from W18
// (asset-owner driven planned outage on IPP generators).
//
// 12-state P6 lifecycle (outage_requested -> security_assessment ->
// n1_contingency_run -> reliability_committee_review -> outage_approved
// -> outage_window_open -> outage_in_progress -> outage_completed ->
// return_to_service -> post_outage_review -> archived) plus 5 branch
// states (rejected / withdrawn / suspended / emergency_cancelled /
// extended). Tier RE-DERIVED on every transition from
// transmission_voltage_kv (low_sub132kv<132 / medium_132kv=132 /
// high_275kv>=275<400 / critical_400kv_plus>=400), FLOOR-AT-HIGH on any
// one of 5 floor flags (peak_demand_period, single_circuit_radial,
// cross_border_interconnector, black_start_path, national_grid_backbone),
// FLOOR-AT-CRITICAL on 2+ flags OR national_grid_backbone OR
// black_start_path. URGENT SLA polarity stored in HOURS (critical
// 400kV+ has SHORTEST runway, low <132 kV has LONGEST).
//
// 4-step authority ladder (outage_planner -> system_operator ->
// reliability_committee_chair -> SO_CEO).

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
  | 'outage_requested' | 'security_assessment' | 'n1_contingency_run'
  | 'reliability_committee_review' | 'outage_approved' | 'outage_window_open'
  | 'outage_in_progress' | 'outage_completed' | 'return_to_service'
  | 'post_outage_review' | 'archived'
  | 'rejected' | 'withdrawn' | 'suspended' | 'emergency_cancelled' | 'extended';

type Tier = 'low_sub132kv' | 'medium_132kv' | 'high_275kv' | 'critical_400kv_plus';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority = 'outage_planner' | 'system_operator' | 'reliability_committee_chair' | 'SO_CEO';

interface TxoRow {
  [key: string]: unknown;
  id: string;
  outage_number: string;
  asset_id: string;
  asset_label: string | null;
  transmission_voltage_kv: number;
  corridor_name: string | null;
  substation_a: string | null;
  substation_b: string | null;
  affected_circuits_count: number;
  planned_outage_ref: string | null;
  curtailment_ref: string | null;
  reserve_activation_ref: string | null;
  outage_type: string | null;
  outage_reason: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  n1_pass_count: number;
  n1_fail_count: number;
  n1_summary: string | null;
  security_margin_pct: number;
  thermal_limit_mw: number | null;
  actual_load_mw: number | null;
  rts_test_passed: number;
  extension_requested: number;
  extension_hours_granted: number;
  suspension_count: number;
  peak_demand_period: number;
  single_circuit_radial: number;
  cross_border_interconnector: number;
  black_start_path: number;
  national_grid_backbone: number;
  current_tier: Tier;
  authority_required: Authority | null;
  urgency_band: string | null;
  outage_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  emergency_cancel_reason: string | null;
  suspend_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  outage_requested_at: string | null;
  security_assessment_at: string | null;
  n1_contingency_run_at: string | null;
  reliability_committee_review_at: string | null;
  outage_approved_at: string | null;
  outage_window_open_at: string | null;
  outage_in_progress_at: string | null;
  outage_completed_at: string | null;
  return_to_service_at: string | null;
  post_outage_review_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  suspended_at: string | null;
  emergency_cancelled_at: string | null;
  extended_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Decorated by route
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  security_margin_pct_live?: number;
  hours_to_outage_window_live?: number | null;
  hours_in_outage_live?: number;
  hours_to_planned_completion_live?: number | null;
  extension_imminent_live?: boolean;
  emergency_cancel_risk_live?: boolean;
  returned_to_service_clean_live?: boolean;
  floor_flag_count_live?: number;
  outage_completeness_index_live?: number;
  bridges_to_planned_outage_chain_live?: boolean;
  bridges_to_curtailment_chain_live?: boolean;
  bridges_to_reserve_activation_chain_live?: boolean;
}

interface KpiData {
  total: number;
  active_count: number;
  in_progress_count: number;
  suspended_count: number;
  emergency_count: number;
  critical_tier_count: number;
  breached: number;
  reportable_total: number;
  planned_bridged_count: number;
  curtailment_bridged_count: number;
  reserve_bridged_count: number;
  total_circuits_offline: number;
  avg_lifecycle_hours: number;
}

const ALL_STATES = [
  'outage_requested',
  'security_assessment',
  'n1_contingency_run',
  'reliability_committee_review',
  'outage_approved',
  'outage_window_open',
  'outage_in_progress',
  'outage_completed',
  'return_to_service',
  'post_outage_review',
  'archived',
] as const;

const BRANCH_STATES = [
  'rejected',
  'withdrawn',
  'suspended',
  'emergency_cancelled',
  'extended',
] as const;

const FILTERS = [
  { key: 'active',              label: 'Active (pre-terminal)' },
  { key: 'all',                 label: 'All' },
  { key: 'in_progress',         label: 'In progress' },
  { key: 'suspended',           label: 'Suspended' },
  { key: 'emergency',           label: 'Emergency cancelled' },
  { key: 'extended',            label: 'Extended' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'critical_urgency',    label: 'Critical urgency' },
  { key: 'planned_bridged',     label: 'Bridged to planned outage' },
  { key: 'curtail_bridged',     label: 'Bridged to curtailment' },
  { key: 'reserve_bridged',     label: 'Bridged to reserve activation' },
  { key: 'critical_400kv_plus', label: 'Critical 400kV+' },
  { key: 'high_275kv',          label: 'High 275kV' },
  { key: 'medium_132kv',        label: 'Medium 132kV' },
  { key: 'low_sub132kv',        label: 'Low <132kV' },
  // state filters
  { key: 'outage_requested',             label: 'Requested' },
  { key: 'security_assessment',          label: 'Security assess' },
  { key: 'n1_contingency_run',           label: 'N-1 run' },
  { key: 'reliability_committee_review', label: 'Committee' },
  { key: 'outage_approved',              label: 'Approved' },
  { key: 'outage_window_open',           label: 'Window open' },
  { key: 'outage_in_progress',           label: 'In progress (state)' },
  { key: 'outage_completed',             label: 'Completed' },
  { key: 'return_to_service',            label: 'RTS' },
  { key: 'post_outage_review',           label: 'Post-review' },
  { key: 'archived',                     label: 'Archived' },
];

const TIERS = new Set<string>(['low_sub132kv', 'medium_132kv', 'high_275kv', 'critical_400kv_plus']);

const AUTH_LABEL: Record<Authority, string> = {
  outage_planner:              'Outage planner',
  system_operator:             'System operator',
  reliability_committee_chair: 'Reliability cmte chair',
  SO_CEO:                      'SO CEO',
};

const TIER_LABEL: Record<Tier, string> = {
  low_sub132kv:        'Low <132kV',
  medium_132kv:        'Medium 132kV',
  high_275kv:          'High 275kV',
  critical_400kv_plus: 'Critical 400kV+',
};

function fmtHours(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  if (Math.abs(v) >= 24) return `${(v / 24).toFixed(digits)}d`;
  return `${v.toFixed(digits)}h`;
}

function fmtMw(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(0)} MW`;
}

function fmtKv(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(0)} kV`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(1)}%`;
}

function getActions(row: TxoRow): ChainAction[] {
  const cs = row.chain_status;
  const actions: ChainAction[] = [];

  if (cs === 'outage_requested') {
    actions.push({
      key: 'start-security-assessment',
      label: 'Start security assessment (planner)',
      tone: 'primary',
      fields: [
        { key: 'security_margin_pct', label: 'Initial security margin pct (optional)', type: 'text', required: false },
        { key: 'actual_load_mw',      label: 'Actual load MW (optional)',              type: 'text', required: false },
        { key: 'thermal_limit_mw',    label: 'Thermal limit MW (optional)',            type: 'text', required: false },
      ],
    });
  }

  if (cs === 'security_assessment') {
    actions.push({
      key: 'run-n1-contingency',
      label: 'Run N-1 contingency (SO)',
      tone: 'primary',
      fields: [
        { key: 'n1_pass_count', label: 'N-1 pass count',           type: 'text',     required: false },
        { key: 'n1_fail_count', label: 'N-1 fail count',           type: 'text',     required: false },
        { key: 'n1_summary',    label: 'N-1 summary (optional)',   type: 'textarea', required: false },
      ],
    });
  }

  if (cs === 'n1_contingency_run') {
    actions.push({
      key: 'submit-to-reliability-committee',
      label: 'Submit to committee (committee)',
      tone: 'primary',
    });
  }

  if (cs === 'reliability_committee_review') {
    actions.push({
      key: 'approve-outage',
      label: 'Approve outage (committee)',
      tone: 'primary',
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'reject-outage',
      label: 'Reject outage (committee)',
      tone: 'danger',
      fields: [
        { key: 'reject_reason', label: 'Reject reason', type: 'textarea', required: true },
      ],
    });
  }

  if (cs === 'outage_approved') {
    actions.push({
      key: 'open-outage-window',
      label: 'Open outage window (SO)',
      tone: 'primary',
      fields: [
        { key: 'scheduled_start_at', label: 'Scheduled start ISO (optional)', type: 'text', required: false },
        { key: 'scheduled_end_at',   label: 'Scheduled end ISO (optional)',   type: 'text', required: false },
      ],
    });
  }

  if (cs === 'outage_window_open') {
    actions.push({
      key: 'commence-outage',
      label: 'Commence outage (SO)',
      tone: 'primary',
      fields: [
        { key: 'actual_start_at', label: 'Actual start ISO (optional, defaults now)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'outage_in_progress') {
    actions.push({
      key: 'suspend-outage',
      label: 'Suspend outage (SO)',
      tone: 'danger',
      fields: [
        { key: 'suspend_reason', label: 'Suspend reason', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'extend-outage',
      label: 'Extend outage (committee)',
      tone: 'warn',
      fields: [
        { key: 'extension_hours_granted', label: 'Extension hours granted',          type: 'text', required: false },
        { key: 'scheduled_end_at',        label: 'New scheduled end ISO (optional)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'complete-outage',
      label: 'Complete outage (SO)',
      tone: 'primary',
      fields: [
        { key: 'actual_end_at', label: 'Actual end ISO (optional, defaults now)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'suspended' || cs === 'extended') {
    actions.push({
      key: 'resume-outage',
      label: 'Resume outage (SO)',
      tone: 'primary',
    });
  }

  if (cs === 'extended') {
    actions.push({
      key: 'complete-outage',
      label: 'Complete outage (SO)',
      tone: 'primary',
      fields: [
        { key: 'actual_end_at', label: 'Actual end ISO (optional, defaults now)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'outage_completed') {
    actions.push({
      key: 'verify-return-to-service',
      label: 'Verify return to service (SO)',
      tone: 'primary',
      fields: [
        { key: 'rts_test_passed', label: 'RTS test passed? (1 = yes, 0 = no)', type: 'text', required: true },
      ],
    });
  }

  if (cs === 'return_to_service') {
    actions.push({
      key: 'close-post-outage-review',
      label: 'Close post-outage review (archiver)',
      tone: 'primary',
    });
  }

  if (cs === 'post_outage_review') {
    actions.push({
      key: 'archive-outage',
      label: 'Archive outage (archiver)',
      tone: 'ghost',
    });
  }

  // emergency_cancel — universal, from any non-terminal
  if (!row.is_terminal && cs !== 'emergency_cancelled') {
    actions.push({
      key: 'emergency-cancel',
      label: 'Emergency cancel (SO)',
      tone: 'danger',
      fields: [
        { key: 'emergency_cancel_reason', label: 'Emergency cancel reason', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // withdraw — pre-approval only
  if (
    cs === 'outage_requested' || cs === 'security_assessment' ||
    cs === 'n1_contingency_run' || cs === 'reliability_committee_review'
  ) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (planner)',
      tone: 'ghost',
      fields: [
        { key: 'withdraw_reason', label: 'Withdraw reason', type: 'textarea', required: false },
      ],
    });
  }

  return actions;
}

function renderDetail(row: TxoRow): React.ReactNode {
  const floored = (row.floor_flag_count_live ?? 0) > 0;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;

  return (
    <div className="space-y-3 text-[12px]">
      {/* Identity + voltage */}
      <div className="grid grid-cols-3 gap-3">
        <DetailPair label="Outage number"   value={row.outage_number} />
        <DetailPair label="Asset"           value={row.asset_label ?? row.asset_id} />
        <DetailPair label="Voltage"         value={fmtKv(row.transmission_voltage_kv)} />
        <DetailPair label="Corridor"        value={row.corridor_name ?? '-'} />
        <DetailPair label="Substation A"    value={row.substation_a ?? '-'} />
        <DetailPair label="Substation B"    value={row.substation_b ?? '-'} />
        <DetailPair label="Tier"            value={TIER_LABEL[row.current_tier]} />
        <DetailPair label="Circuits"        value={`${row.affected_circuits_count}`} />
        {authorityNow && <DetailPair label="Authority required" value={AUTH_LABEL[authorityNow]} />}
      </div>

      {/* Outage window */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: TX3 }}>Outage window</div>
        <div className="grid grid-cols-3 gap-3">
          <DetailPair label="Scheduled start"    value={row.scheduled_start_at ? new Date(row.scheduled_start_at).toLocaleString() : '-'} />
          <DetailPair label="Scheduled end"      value={row.scheduled_end_at ? new Date(row.scheduled_end_at).toLocaleString() : '-'} />
          <DetailPair label="Actual start"       value={row.actual_start_at ? new Date(row.actual_start_at).toLocaleString() : '-'} />
          <DetailPair label="Actual end"         value={row.actual_end_at ? new Date(row.actual_end_at).toLocaleString() : '-'} />
          <DetailPair label="Hours to window"    value={fmtHours(row.hours_to_outage_window_live)} />
          <DetailPair label="Hours in outage"    value={fmtHours(row.hours_in_outage_live)} />
          <DetailPair label="Hours to completion" value={fmtHours(row.hours_to_planned_completion_live)} />
          <DetailPair label="Extension hrs"      value={`${row.extension_hours_granted}`} />
          <DetailPair label="Suspensions"        value={`${row.suspension_count}`} />
        </div>
      </div>

      {/* N-1 + security */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: TX3 }}>N-1 + security battery</div>
        <div className="grid grid-cols-4 gap-3">
          <DetailPair label="N-1 pass"        value={`${row.n1_pass_count}`} />
          <DetailPair label="N-1 fail"        value={`${row.n1_fail_count}`} />
          <DetailPair label="Security margin" value={fmtPct(row.security_margin_pct_live ?? row.security_margin_pct)} />
          <DetailPair label="Thermal limit"   value={fmtMw(row.thermal_limit_mw)} />
          <DetailPair label="Actual load"     value={fmtMw(row.actual_load_mw)} />
          <DetailPair label="RTS test"        value={row.rts_test_passed ? 'PASS' : '-'} />
          <DetailPair label="Completeness"    value={`${(row.outage_completeness_index_live ?? 0).toFixed(0)} / 130`} />
          <DetailPair label="SLA hrs left"    value={row.sla_hours_remaining_live != null ? fmtHours(row.sla_hours_remaining_live) : '-'} />
          <DetailPair label="Reg filing window" value={row.regulator_filing_window_hours_live != null ? `${row.regulator_filing_window_hours_live}h` : '-'} />
          <DetailPair label="Escalations"     value={`${row.escalation_level}`} />
          {row.n1_summary && <DetailPair label="N-1 summary" value={row.n1_summary} />}
        </div>
      </div>

      {/* Floor flags */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: TX3 }}>Floor flags {floored && `(${row.floor_flag_count_live} active)`}</div>
        <div className="grid grid-cols-2 gap-2">
          <FlagPill on={!!row.peak_demand_period}        label="Peak demand period (HIGH)" />
          <FlagPill on={!!row.single_circuit_radial}     label="Single-circuit radial (HIGH)" />
          <FlagPill on={!!row.cross_border_interconnector} label="Cross-border interconnector (HIGH)" />
          <FlagPill on={!!row.black_start_path}          label="Black-start path (CRITICAL)" />
          <FlagPill on={!!row.national_grid_backbone}    label="National grid backbone (CRITICAL)" />
          <FlagPill on={!!row.regulator_relevant}        label="Regulator relevant" />
        </div>
      </div>

      {/* Cross-chain bridges */}
      {(row.planned_outage_ref || row.curtailment_ref || row.reserve_activation_ref || row.regulator_inbox_ref || row.regulator_ref) && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: TX3 }}>Cross-chain references</div>
          <div className="grid grid-cols-2 gap-3">
            {row.planned_outage_ref    && <DetailPair label="Planned outage ref" value={row.planned_outage_ref} />}
            {row.curtailment_ref       && <DetailPair label="Curtailment ref"    value={row.curtailment_ref} />}
            {row.reserve_activation_ref && <DetailPair label="Reserve activation ref" value={row.reserve_activation_ref} />}
            {row.regulator_inbox_ref   && <DetailPair label="Regulator inbox"        value={row.regulator_inbox_ref} />}
            {row.regulator_ref         && <DetailPair label="Regulator ref"          value={row.regulator_ref} />}
          </div>
        </div>
      )}

      {/* Reason codes */}
      {(row.outage_reason || row.outage_type || row.reject_reason || row.withdraw_reason || row.suspend_reason || row.emergency_cancel_reason) && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: TX3 }}>Reason codes</div>
          <div className="grid grid-cols-2 gap-3">
            {row.outage_type              && <DetailPair label="Outage type"            value={row.outage_type} />}
            {row.outage_reason            && <DetailPair label="Outage reason"          value={row.outage_reason} />}
            {row.reject_reason            && <DetailPair label="Reject reason"          value={row.reject_reason} />}
            {row.withdraw_reason          && <DetailPair label="Withdraw reason"        value={row.withdraw_reason} />}
            {row.suspend_reason           && <DetailPair label="Suspend reason"         value={row.suspend_reason} />}
            {row.emergency_cancel_reason  && <DetailPair label="Emergency cancel reason" value={row.emergency_cancel_reason} />}
          </div>
        </div>
      )}
    </div>
  );
}

export function TransmissionOutageChainTab() {
  const [rows, setRows] = useState<TxoRow[]>([]);
  const [summary, setSummary] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: TxoRow[] } }>('/grid/transmission-outage/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d as any;
        setSummary(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load transmission outages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      // Convert numeric string fields to numbers before posting
      const numericFields = [
        'security_margin_pct', 'actual_load_mw', 'thermal_limit_mw',
        'n1_pass_count', 'n1_fail_count', 'extension_hours_granted', 'rts_test_passed',
      ];
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        body[k] = numericFields.includes(k) ? Number(v) : v;
      }
      await api.post(`/grid/transmission-outage/chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: TxoRow; events: ChainEvent[] } }>(`/grid/transmission-outage/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load outage history');
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')               return true;
      if (filter === 'active')            return !r.is_terminal;
      if (filter === 'in_progress')       return r.chain_status === 'outage_in_progress' || r.chain_status === 'extended';
      if (filter === 'suspended')         return r.chain_status === 'suspended';
      if (filter === 'emergency')         return r.chain_status === 'emergency_cancelled';
      if (filter === 'extended')          return r.chain_status === 'extended';
      if (filter === 'breached')          return r.sla_breached_live;
      if (filter === 'reportable')        return r.is_reportable_flag;
      if (filter === 'critical_urgency')  return r.urgency_band_live === 'critical';
      if (filter === 'planned_bridged')   return r.bridges_to_planned_outage_chain_live;
      if (filter === 'curtail_bridged')   return r.bridges_to_curtailment_chain_live;
      if (filter === 'reserve_bridged')   return r.bridges_to_reserve_activation_chain_live;
      if (TIERS.has(filter))              return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ background: BG, padding: 16, borderRadius: 12, minHeight: 400 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1, margin: 0 }}>
            Transmission Outage Coordination
          </h2>
          <p style={{ fontSize: 11, color: TX3, margin: '2px 0 0', fontFamily: MONO }}>
            N-1 security assessment · 12-state lifecycle · URGENT SLA
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{ fontSize: 11, color: TX2, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-8 gap-2">
        <KpiTile label="SLA breached"     value={summary?.breached ?? 0}              tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="In progress"      value={summary?.in_progress_count ?? 0}     tone={(summary?.in_progress_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Emergency cancel" value={summary?.emergency_count ?? 0}       tone={(summary?.emergency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Critical 400kV+"  value={summary?.critical_tier_count ?? 0}   tone={(summary?.critical_tier_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Active"           value={summary?.active_count ?? 0} />
        <KpiTile label="Total"            value={summary?.total ?? 0} />
        <KpiTile label="Circuits offline" value={summary?.total_circuits_offline ?? 0} />
        <KpiTile label="Avg lifecycle"    value={fmtHours(summary?.avg_lifecycle_hours ?? 0)} />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 999,
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
        <div style={{ padding: '8px 12px', background: 'oklch(0.97 0.04 20)', color: BAD, borderRadius: 6, fontSize: 12, border: `1px solid ${BAD}40` }}>
          {err}
        </div>
      )}

      {/* Chain cards */}
      <div className="space-y-2">
        {loading ? (
          <div style={{ textAlign: 'center', color: TX3, padding: 32, fontSize: 13 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: TX3, padding: 32, fontSize: 13 }}>No transmission outages match the current filter.</div>
        ) : filtered.map((row) => {
          const floored = (row.floor_flag_count_live ?? 0) > 0;
          const bridges = [
            row.bridges_to_planned_outage_chain_live && 'Planned outage',
            row.bridges_to_curtailment_chain_live    && 'Curtailment',
            row.bridges_to_reserve_activation_chain_live && 'Reserve activation',
          ].filter(Boolean).join(' · ');

          const metaParts: string[] = [
            fmtKv(row.transmission_voltage_kv),
            TIER_LABEL[row.current_tier],
            row.corridor_name ?? '',
            `${row.affected_circuits_count} circuits`,
          ];
          if (floored) metaParts.push(`FLOOR ${row.floor_flag_count_live}`);
          if (bridges) metaParts.push(bridges);
          if (row.emergency_cancel_risk_live) metaParts.push('EC RISK');
          if (row.extension_imminent_live)    metaParts.push('EXT IMMINENT');
          if (row.is_reportable_flag)         metaParts.push('Reportable');

          return (
            <ChainCard
              key={row.id}
              item={{
                ...row,
                case_number: row.outage_number,
                sla_breached: row.sla_breached_live || !!row.sla_breached,
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.asset_label ?? row.asset_id}${row.corridor_name ? ' — ' + row.corridor_name : ''}`}
              meta={metaParts.filter(Boolean).join('  ·  ')}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              onExpand={handleExpand}
              events={expandedEvents[row.id]}
              detail={renderDetail(row)}
              cascadeTo={['admin', 'grid_operator']}
            />
          );
        })}
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      borderRadius: 6,
      fontSize: 11,
      background: on ? 'oklch(0.96 0.05 55)' : BG2,
      color: on ? WARN : TX3,
      border: `1px solid ${on ? 'oklch(0.80 0.12 55)' : BORDER}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? WARN : TX3, flexShrink: 0, display: 'inline-block' }} />
      {label}
    </div>
  );
}

export default TransmissionOutageChainTab;
