// Wave 121 - Control-Environment Audit (FOURTH and FINAL Phase-B wave).
//
// Mounted at /admin-platform/workstation?tab=control-environment-audit for
// admin write, and /regulator-suite/workstation?tab=external-controls for
// regulator/external-auditor read.
//
// Beats: ServiceNow GRC + SAP GRC + AuditBoard + Workiva + LogicGate +
// MetricStream + Hyperproof + Drata + Vanta - by producing tamper-evident
// L5 per-control evidence dossiers against the W118 chain + W119 export
// packs + W120 attestations, with control_owner -> process_owner -> CISO
// -> audit_committee_chair sign-off ladders and signed-JWT external-auditor
// read access.
//
// 12-state forward + 4 branch lifecycle:
//   control_defined -> design_documented -> walkthrough_completed ->
//     tod_test_planned -> tod_evidence_collected -> tod_test_executed ->
//     tooe_test_planned -> tooe_evidence_collected ->
//     tooe_test_executed -> deficiency_assessed ->
//     remediation_completed -> archived (HARD terminal)
//   any non-terminal -> flag_deficient -> deficient (TERMINAL)
//   any pre-archive -> accept_with_exception -> excepted (SOFT)
//   any active -> suspend -> suspended (SOFT; resume via assess_deficiency)
//   failed-ToD/ToOE/deficiency/remediation -> initiate_re_test ->
//     remediated_re_test (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger classification = more prep:
//   preventive 168h / detective 240h / corrective 360h / directive 480h
//   / governance 720h.
// FLOOR-AT-DIRECTIVE on >=1 of 5 flags; >=2 lifts to governance.
// Flags: material_weakness_suspected / regulator_audit_in_progress /
// soc2_type2_period_open / iso27001_surveillance_audit_due /
// sox_404_attestation_pending.
//
// SIGNATURE Phase-B regulator crossings:
//   * flag_deficient crosses EVERY tier when material_weakness_suspected
//     (W121 SIGNATURE - MATERIAL-WEAKNESS-DEFICIENT hard line;
//     SSAE 18 + ISA 265 + JSE 8.62 + Companies Act s30 + COSO Monitoring)
//   * accept_with_exception crosses directive + governance only
//   * archive crosses EVERY tier when external_auditor_sign_off
//   * sla_breached crosses directive + governance only
//
// Write {admin ONLY}. READ all 9 personas. External-auditor read via
// signed JWT (HS256) on /external/:id.
//
// 4-step authority ladder:
//   control_owner -> process_owner -> CISO -> audit_committee_chair.
//
// 8 bridges (W118 MANDATORY): W113 EVM + W114 doc-control + W115 submittal
// + W116 RFI + W117 CO + W118 block range + W119 export pack + W120
// attestation ref.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type CeaStatus =
  | 'control_defined' | 'design_documented' | 'walkthrough_completed'
  | 'tod_test_planned' | 'tod_evidence_collected' | 'tod_test_executed'
  | 'tooe_test_planned' | 'tooe_evidence_collected' | 'tooe_test_executed'
  | 'deficiency_assessed' | 'remediation_completed' | 'archived'
  | 'deficient' | 'excepted' | 'suspended' | 'remediated_re_test';

type CeaTier = 'preventive' | 'detective' | 'corrective' | 'directive' | 'governance';
type CeaClassification = CeaTier;
type CeaUrgency = 'low' | 'medium' | 'high' | 'critical';
type CeaAuthority = 'control_owner' | 'process_owner' | 'CISO' | 'audit_committee_chair';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type DeficiencySeverity = 'none' | 'control_deficiency' | 'significant_deficiency' | 'material_weakness';

interface CeaRow {
  id: string;
  control_number: string;
  control_classification: CeaClassification;
  control_framework: string | null;
  framework_control_ref: string | null;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  w113_evm_ref: string | null;
  w114_doc_control_ref: string | null;
  w115_submittal_ref: string | null;
  w116_rfi_ref: string | null;
  w117_change_order_ref: string | null;
  w118_block_height_range_low: number | null;
  w118_block_height_range_high: number | null;
  w119_export_pack_ref: string | null;
  w120_attestation_ref: string | null;
  parent_control_id: string | null;
  material_weakness_suspected: number;
  regulator_audit_in_progress: number;
  soc2_type2_period_open: number;
  iso27001_surveillance_audit_due: number;
  sox_404_attestation_pending: number;
  control_description: number;
  control_objective: number;
  responsible_party: number;
  frequency_documented: number;
  inputs_documented: number;
  outputs_documented: number;
  ipe_documented: number;
  manual_or_automated: number;
  coso_principle_mapped: number;
  iso27001_control_mapped: number;
  soc2_criteria_mapped: number;
  walkthrough_evidence: number;
  soa_linked: number;
  tod_sample_size: number;
  tod_reviewer_signoff: number;
  tod_pass_rate_pct: number;
  tod_exceptions_logged: number;
  tod_passed: number;
  tooe_sample_size: number;
  tooe_reviewer_signoff: number;
  tooe_pass_rate_pct: number;
  tooe_exceptions_logged: number;
  tooe_passed: number;
  deficiency_severity: DeficiencySeverity | null;
  remediation_progress_pct: number;
  external_auditor_sign_off: number;
  current_tier: CeaTier;
  authority_required: CeaAuthority | null;
  urgency_band: CeaUrgency | null;
  control_health_band: HealthBand | null;
  design_documentation_completeness_index: number;
  tod_test_completeness_index: number;
  tooe_test_completeness_index: number;
  evidence_coverage_index: number;
  audit_window_hours: number;
  days_to_quarterly_cutoff: number;
  days_to_annual_audit: number;
  title: string | null;
  reason_code: string | null;
  deficient_reason: string | null;
  exception_reason: string | null;
  suspend_reason: string | null;
  is_reportable_flag: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  external_auditor_firm: string | null;
  external_auditor_engagement_ref: string | null;
  external_auditor_jwt_jti: string | null;
  chain_status: CeaStatus;
  control_defined_at: string | null;
  design_documented_at: string | null;
  walkthrough_completed_at: string | null;
  tod_test_planned_at: string | null;
  tod_evidence_collected_at: string | null;
  tod_test_executed_at: string | null;
  tooe_test_planned_at: string | null;
  tooe_evidence_collected_at: string | null;
  tooe_test_executed_at: string | null;
  deficiency_assessed_at: string | null;
  remediation_completed_at: string | null;
  archived_at: string | null;
  deficient_at: string | null;
  excepted_at: string | null;
  suspended_at: string | null;
  remediated_re_test_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // LIVE decoration battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  sla_hours_remaining_live?: number;
  urgency_band_live?: CeaUrgency;
  authority_required_live?: CeaAuthority;
  audit_window_hours_live?: number;
  days_to_quarterly_cutoff_live?: number;
  days_to_annual_audit_live?: number;
  floor_flag_count_live?: number;
  floor_at_directive_live?: boolean;
  floor_at_governance_live?: boolean;
  design_documentation_completeness_index_live?: number;
  tod_test_completeness_index_live?: number;
  tooe_test_completeness_index_live?: number;
  evidence_coverage_index_live?: number;
  control_health_band_live?: HealthBand;
  breach_crosses_regulator?: boolean;
  bridges_to_w113_evm_chain_live?: boolean;
  bridges_to_w114_doc_control_chain_live?: boolean;
  bridges_to_w115_submittal_chain_live?: boolean;
  bridges_to_w116_rfi_chain_live?: boolean;
  bridges_to_w117_change_order_chain_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
  bridges_to_w119_regulator_export_chain_live?: boolean;
  bridges_to_w120_reconciliation_attestation_chain_live?: boolean;
}

interface CeaEvent {
  id: string;
  control_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_tier: string | null;
  to_tier: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<CeaStatus, { bg: string; fg: string; label: string }> = {
  control_defined:        { bg: '#e3e7ec', fg: '#445',    label: 'Defined' },
  design_documented:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Design documented' },
  walkthrough_completed:  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Walkthrough' },
  tod_test_planned:       { bg: '#fff4d6', fg: '#a06200', label: 'ToD planned' },
  tod_evidence_collected: { bg: '#fff4d6', fg: '#a06200', label: 'ToD evidence' },
  tod_test_executed:      { bg: '#fff4d6', fg: '#a06200', label: 'ToD executed' },
  tooe_test_planned:      { bg: '#fff4d6', fg: '#a06200', label: 'ToOE planned' },
  tooe_evidence_collected:{ bg: '#fff4d6', fg: '#a06200', label: 'ToOE evidence' },
  tooe_test_executed:     { bg: '#fff4d6', fg: '#a06200', label: 'ToOE executed' },
  deficiency_assessed:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Deficiency assessed' },
  remediation_completed:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Remediated' },
  archived:               { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  deficient:              { bg: '#7a0e0e', fg: '#fff',    label: 'Deficient' },
  excepted:               { bg: '#fff4d6', fg: '#a06200', label: 'Excepted' },
  suspended:              { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
  remediated_re_test:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Re-test' },
};

const TIER_TONE: Record<CeaTier, { bg: string; fg: string; label: string }> = {
  preventive:  { bg: '#e3e7ec', fg: '#557',    label: 'Preventive' },
  detective:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Detective' },
  corrective:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Corrective' },
  directive:   { bg: '#fff4d6', fg: '#a06200', label: 'Directive' },
  governance:  { bg: '#7a0e0e', fg: '#fff',    label: 'Governance' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'material_weak',   label: 'Material weakness' },
  { key: 'reg_audit',       label: 'Reg audit live' },
  { key: 'soc2_open',       label: 'SOC2 Type II open' },
  { key: 'iso27001_due',    label: 'ISO27001 due' },
  { key: 'sox404_pending',  label: 'SOX 404 pending' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
  { key: 'deficient',       label: 'Deficient' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'control_defined',        label: 'Defined' },
  { key: 'design_documented',      label: 'Design' },
  { key: 'walkthrough_completed',  label: 'Walkthrough' },
  { key: 'tod_test_planned',       label: 'ToD planned' },
  { key: 'tod_evidence_collected', label: 'ToD evidence' },
  { key: 'tod_test_executed',      label: 'ToD executed' },
  { key: 'tooe_test_planned',      label: 'ToOE planned' },
  { key: 'tooe_evidence_collected',label: 'ToOE evidence' },
  { key: 'tooe_test_executed',     label: 'ToOE executed' },
  { key: 'deficiency_assessed',    label: 'Deficiency' },
  { key: 'remediation_completed',  label: 'Remediated' },
  { key: 'archived',               label: 'Archived' },
  { key: 'deficient',              label: 'Deficient' },
  { key: 'excepted',               label: 'Excepted' },
  { key: 'suspended',              label: 'Suspended' },
  { key: 'remediated_re_test',     label: 'Re-test' },
];

const FILTERS_CLASSIFICATION: Array<{ key: string; label: string }> = [
  { key: 'cls:preventive',  label: 'Preventive (168h)' },
  { key: 'cls:detective',   label: 'Detective (240h)' },
  { key: 'cls:corrective',  label: 'Corrective (360h)' },
  { key: 'cls:directive',   label: 'Directive (480h)' },
  { key: 'cls:governance',  label: 'Governance (720h)' },
];

const FILTERS_FRAMEWORK: Array<{ key: string; label: string }> = [
  { key: 'fw:coso_2013',      label: 'COSO 2013' },
  { key: 'fw:soc2_tsc',       label: 'SOC 2 TSC' },
  { key: 'fw:iso27001_2022',  label: 'ISO 27001:2022' },
  { key: 'fw:iso27002_2022',  label: 'ISO 27002:2022' },
  { key: 'fw:nist_csf_20',    label: 'NIST CSF 2.0' },
  { key: 'fw:nist_sp_800_53', label: 'NIST SP 800-53' },
  { key: 'fw:cmmc_l3',        label: 'CMMC L3' },
  { key: 'fw:cobit_2019',     label: 'COBIT 2019' },
  { key: 'fw:itil_4',         label: 'ITIL 4' },
  { key: 'fw:cis_v8',         label: 'CIS v8' },
  { key: 'fw:sox_404',        label: 'SOX 404' },
  { key: 'fw:popia',          label: 'POPIA' },
  { key: 'fw:king_iv',        label: 'King IV' },
  { key: 'fw:jse_srl_862',    label: 'JSE SRL 8.62' },
];

type ActionKind =
  | 'document-design' | 'complete-walkthrough' | 'plan-tod-test'
  | 'collect-tod-evidence' | 'execute-tod-test' | 'plan-tooe-test'
  | 'collect-tooe-evidence' | 'execute-tooe-test' | 'assess-deficiency'
  | 'complete-remediation' | 'archive' | 'flag-deficient'
  | 'accept-with-exception' | 'suspend' | 'initiate-re-test';

const ACTION_FOR_STATE: Partial<Record<CeaStatus, ActionKind>> = {
  control_defined:        'document-design',
  design_documented:      'complete-walkthrough',
  walkthrough_completed:  'plan-tod-test',
  tod_test_planned:       'collect-tod-evidence',
  tod_evidence_collected: 'execute-tod-test',
  tod_test_executed:      'plan-tooe-test',
  tooe_test_planned:      'collect-tooe-evidence',
  tooe_evidence_collected:'execute-tooe-test',
  tooe_test_executed:     'assess-deficiency',
  deficiency_assessed:    'complete-remediation',
  remediation_completed:  'archive',
  suspended:              'assess-deficiency',
  remediated_re_test:     'plan-tooe-test',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'document-design':       'Document design (control_owner - 12 design attributes)',
  'complete-walkthrough':  'Walkthrough (control_owner - evidence attached)',
  'plan-tod-test':         'Plan ToD test (control_owner - sample size + population)',
  'collect-tod-evidence':  'Collect ToD evidence (control_owner - attach + sign)',
  'execute-tod-test':      'Execute ToD test (process_owner - pass rate + exceptions)',
  'plan-tooe-test':        'Plan ToOE test (process_owner - sample over period)',
  'collect-tooe-evidence': 'Collect ToOE evidence (process_owner - attach + sign)',
  'execute-tooe-test':     'Execute ToOE test (process_owner - pass rate + exceptions)',
  'assess-deficiency':     'Assess deficiency (CISO - severity + material-weakness)',
  'complete-remediation':  'Complete remediation (CISO - progress to 100%)',
  'archive':               'Archive (audit_committee_chair - HARD; ext auditor signoff EVERY tier)',
  'flag-deficient':        'FLAG DEFICIENT (admin - SIGNATURE EVERY tier when material weakness)',
  'accept-with-exception': 'Accept with exception (CISO - directive+governance crosses regulator)',
  'suspend':               'Suspend (process_owner - regulator-audit-in-progress; resume via assess)',
  'initiate-re-test':      'Initiate re-test (CISO - after failed ToD/ToOE/deficiency/remediation)',
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

interface KpiSummary {
  total: number;
  active_count: number;
  defined_count: number;
  design_count: number;
  walkthrough_count: number;
  tod_planned_count: number;
  tod_evidence_count: number;
  tod_executed_count: number;
  tooe_planned_count: number;
  tooe_evidence_count: number;
  tooe_executed_count: number;
  deficiency_count: number;
  remediation_count: number;
  archived_count: number;
  deficient_count: number;
  excepted_count: number;
  suspended_count: number;
  re_test_count: number;
  breached: number;
  reportable_total: number;
  material_weakness_total: number;
  floor_flag_total: number;
  w113_bridged_count: number;
  w114_bridged_count: number;
  w115_bridged_count: number;
  w116_bridged_count: number;
  w117_bridged_count: number;
  w118_bridged_count: number;
  w119_bridged_count: number;
  w120_bridged_count: number;
  design_avg: number;
  tod_avg: number;
  tooe_avg: number;
  evidence_avg: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  defined_count: 0, design_count: 0, walkthrough_count: 0,
  tod_planned_count: 0, tod_evidence_count: 0, tod_executed_count: 0,
  tooe_planned_count: 0, tooe_evidence_count: 0, tooe_executed_count: 0,
  deficiency_count: 0, remediation_count: 0, archived_count: 0,
  deficient_count: 0, excepted_count: 0, suspended_count: 0, re_test_count: 0,
  breached: 0, reportable_total: 0, material_weakness_total: 0, floor_flag_total: 0,
  w113_bridged_count: 0, w114_bridged_count: 0, w115_bridged_count: 0,
  w116_bridged_count: 0, w117_bridged_count: 0, w118_bridged_count: 0,
  w119_bridged_count: 0, w120_bridged_count: 0,
  design_avg: 0, tod_avg: 0, tooe_avg: 0, evidence_avg: 0,
};

interface Props {
  // Regulator-suite slice: shows deficient + excepted + reportable rows only,
  // read-only. Used at /regulator-suite/workstation?tab=external-controls to
  // inspect material-weakness-deficient controls regulator-relevant under
  // SSAE 18 + ISA 265 + JSE Listings 8.62 + Companies Act s30.
  regulatorView?: boolean;
}

export function ControlEnvironmentAuditTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<CeaRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'deficient' : 'active');
  const [selected, setSelected] = useState<CeaRow | null>(null);
  const [events, setEvents] = useState<CeaEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CeaRow[] } & KpiSummary }>('/control-environment-audit');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          defined_count: data.defined_count || 0,
          design_count: data.design_count || 0,
          walkthrough_count: data.walkthrough_count || 0,
          tod_planned_count: data.tod_planned_count || 0,
          tod_evidence_count: data.tod_evidence_count || 0,
          tod_executed_count: data.tod_executed_count || 0,
          tooe_planned_count: data.tooe_planned_count || 0,
          tooe_evidence_count: data.tooe_evidence_count || 0,
          tooe_executed_count: data.tooe_executed_count || 0,
          deficiency_count: data.deficiency_count || 0,
          remediation_count: data.remediation_count || 0,
          archived_count: data.archived_count || 0,
          deficient_count: data.deficient_count || 0,
          excepted_count: data.excepted_count || 0,
          suspended_count: data.suspended_count || 0,
          re_test_count: data.re_test_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          material_weakness_total: data.material_weakness_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w113_bridged_count: data.w113_bridged_count || 0,
          w114_bridged_count: data.w114_bridged_count || 0,
          w115_bridged_count: data.w115_bridged_count || 0,
          w116_bridged_count: data.w116_bridged_count || 0,
          w117_bridged_count: data.w117_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          w119_bridged_count: data.w119_bridged_count || 0,
          w120_bridged_count: data.w120_bridged_count || 0,
          design_avg: data.design_avg || 0,
          tod_avg: data.tod_avg || 0,
          tooe_avg: data.tooe_avg || 0,
          evidence_avg: data.evidence_avg || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load control-environment audits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { control: CeaRow; events: CeaEvent[] } }>(`/control-environment-audit/${id}`);
      if (res.data?.data?.control) setSelected(res.data.data.control);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load control history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return !!r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'material_weak')   return !!r.material_weakness_suspected;
      if (filter === 'reg_audit')       return !!r.regulator_audit_in_progress;
      if (filter === 'soc2_open')       return !!r.soc2_type2_period_open;
      if (filter === 'iso27001_due')    return !!r.iso27001_surveillance_audit_due;
      if (filter === 'sox404_pending')  return !!r.sox_404_attestation_pending;
      if (filter === 'health_red')      return r.control_health_band_live === 'red';
      if (filter === 'health_critical') return r.control_health_band_live === 'critical';
      if (filter.startsWith('cls:'))    return r.control_classification === filter.slice(4);
      if (filter.startsWith('fw:'))     return r.control_framework === filter.slice(3);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: CeaRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'document-design') {
        const desc  = window.confirm('Control description documented?');
        const obj   = window.confirm('Control objective documented?');
        const resp  = window.confirm('Responsible party assigned?');
        const freq  = window.confirm('Frequency documented?');
        const ins   = window.confirm('Inputs documented?');
        const outs  = window.confirm('Outputs documented?');
        const ipe   = window.confirm('IPE (information-produced-by-entity) documented?');
        const mode  = window.confirm('Manual / automated mode documented?');
        const coso  = window.confirm('COSO principle mapped?');
        const iso   = window.confirm('ISO 27001 control mapped?');
        const soc2  = window.confirm('SOC 2 criteria mapped?');
        const soa   = window.confirm('SoA (Statement of Applicability) linked?');
        body.control_description = desc ? 1 : 0;
        body.control_objective = obj ? 1 : 0;
        body.responsible_party = resp ? 1 : 0;
        body.frequency_documented = freq ? 1 : 0;
        body.inputs_documented = ins ? 1 : 0;
        body.outputs_documented = outs ? 1 : 0;
        body.ipe_documented = ipe ? 1 : 0;
        body.manual_or_automated = mode ? 1 : 0;
        body.coso_principle_mapped = coso ? 1 : 0;
        body.iso27001_control_mapped = iso ? 1 : 0;
        body.soc2_criteria_mapped = soc2 ? 1 : 0;
        body.soa_linked = soa ? 1 : 0;
        const fw = window.prompt(
          'Control framework (coso_2013/soc2_tsc/iso27001_2022/nist_csf_20/sox_404/popia/king_iv/jse_srl_862...):',
          row.control_framework ?? '',
        );
        if (fw) body.control_framework = fw;
        const fcr = window.prompt('Framework control ref (e.g. CC6.1, A.5.1, PR.AC-1):', row.framework_control_ref ?? '');
        if (fcr) body.framework_control_ref = fcr;
      } else if (action === 'complete-walkthrough') {
        const has = window.confirm('Walkthrough evidence attached?');
        body.walkthrough_evidence = has ? 1 : 0;
      } else if (action === 'plan-tod-test') {
        const sz = window.prompt('ToD sample size:', String(row.tod_sample_size ?? 25));
        if (sz !== null) body.tod_sample_size = Number(sz);
      } else if (action === 'collect-tod-evidence') {
        const sz = window.prompt('ToD sample size (final):', String(row.tod_sample_size ?? 25));
        if (sz !== null) body.tod_sample_size = Number(sz);
      } else if (action === 'execute-tod-test') {
        const pct = window.prompt('ToD pass rate %:', String(row.tod_pass_rate_pct ?? 100));
        if (pct !== null) body.tod_pass_rate_pct = Number(pct);
        body.tod_exceptions_logged = window.confirm('ToD exceptions logged?') ? 1 : 0;
        body.tod_passed = window.confirm('ToD PASSED?') ? 1 : 0;
        body.tod_reviewer_signoff = window.confirm('ToD reviewer signed off?') ? 1 : 0;
      } else if (action === 'plan-tooe-test') {
        const sz = window.prompt('ToOE sample size (across full period):', String(row.tooe_sample_size ?? 60));
        if (sz !== null) body.tooe_sample_size = Number(sz);
      } else if (action === 'collect-tooe-evidence') {
        const sz = window.prompt('ToOE sample size (final):', String(row.tooe_sample_size ?? 60));
        if (sz !== null) body.tooe_sample_size = Number(sz);
      } else if (action === 'execute-tooe-test') {
        const pct = window.prompt('ToOE pass rate %:', String(row.tooe_pass_rate_pct ?? 100));
        if (pct !== null) body.tooe_pass_rate_pct = Number(pct);
        body.tooe_exceptions_logged = window.confirm('ToOE exceptions logged?') ? 1 : 0;
        body.tooe_passed = window.confirm('ToOE PASSED?') ? 1 : 0;
        body.tooe_reviewer_signoff = window.confirm('ToOE reviewer signed off?') ? 1 : 0;
      } else if (action === 'assess-deficiency') {
        const sev = window.prompt(
          'Deficiency severity (none/control_deficiency/significant_deficiency/material_weakness):',
          row.deficiency_severity ?? 'none',
        );
        if (sev !== null) body.deficiency_severity = sev;
        body.material_weakness_suspected = sev === 'material_weakness' ? 1 : 0;
      } else if (action === 'complete-remediation') {
        const pct = window.prompt('Remediation progress % (0-100):', String(row.remediation_progress_pct ?? 100));
        if (pct !== null) body.remediation_progress_pct = Number(pct);
      } else if (action === 'archive') {
        const eas = window.confirm(
          'External auditor sign-off attached?\n\nNOTE: archive crosses regulator EVERY tier when external_auditor_sign_off=true.',
        );
        body.external_auditor_sign_off = eas ? 1 : 0;
        if (eas) {
          const firm = window.prompt('External auditor firm (e.g. PwC South Africa):', row.external_auditor_firm ?? '');
          if (firm) body.external_auditor_firm = firm;
          const ref = window.prompt('Engagement ref (e.g. ENG-2026-OE-ICFR):', row.external_auditor_engagement_ref ?? '');
          if (ref) body.external_auditor_engagement_ref = ref;
          const jti = window.prompt('External auditor JWT jti (signed token id):', row.external_auditor_jwt_jti ?? '');
          if (jti) body.external_auditor_jwt_jti = jti;
        }
        const note = window.prompt('Archive notes (audit_committee_chair - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'flag-deficient') {
        const reason = window.prompt(
          'Deficient reason. NOTE: SIGNATURE - crosses regulator EVERY tier when material_weakness_suspected (SSAE 18 + ISA 265 + JSE 8.62 + s30).',
          row.deficient_reason ?? '',
        );
        if (reason === null) return;
        body.deficient_reason = reason;
        const sev = window.prompt(
          'Deficiency severity (control_deficiency/significant_deficiency/material_weakness):',
          row.deficiency_severity ?? 'control_deficiency',
        );
        if (sev !== null) body.deficiency_severity = sev;
        body.material_weakness_suspected = sev === 'material_weakness' ? 1 : 0;
      } else if (action === 'accept-with-exception') {
        const reason = window.prompt(
          'Exception reason. NOTE: crosses regulator on directive + governance only.',
          row.exception_reason ?? '',
        );
        if (reason === null) return;
        body.exception_reason = reason;
      } else if (action === 'suspend') {
        const reason = window.prompt('Suspend reason (regulator-audit-in-progress?):', row.suspend_reason ?? '');
        if (reason === null) return;
        body.suspend_reason = reason;
        body.regulator_audit_in_progress = window.confirm('Regulator audit in progress?') ? 1 : 0;
      } else if (action === 'initiate-re-test') {
        const note = window.prompt('Re-test note (back to remediated_re_test; ToOE replan next):', '');
        if (note !== null) body.notes = note;
      }
      await api.post(`/control-environment-audit/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/control-environment-audit', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Define failed');
    }
  }, [load]);

  return (
    <div className="text-[12px] text-[#1a3a5c]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2a4d]">Control-environment audit (W121)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state per-control evidence dossier - Design / ToD / ToOE / deficiency / remediation - against W118 chain + W119 packs + W120 attestations.
            Closes SOC 2 Type II + COSO 2013 ICIF + ISO 27001:2022 ISMS certification loop.
            INVERTED SLA HOURS (preventive 168 / detective 240 / corrective 360 / directive 480 / governance 720).
            FLOOR-AT-DIRECTIVE {'≥'}1 flag / FLOOR-AT-GOVERNANCE {'≥'}2 flags. Mandatory W118 bridge.
            SIGNATURE: flag-deficient EVERY tier when material_weakness_suspected.
          </p>
        </div>
        {!regulatorView && (
          <button
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a3a5c]"
          >
            + Define control
          </button>
        )}
      </div>

      {/* 8-card KPI strip */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Active"           value={kpis.active_count} />
        <Kpi label="Archived"         value={kpis.archived_count} tone="ok" />
        <Kpi label="Deficient"        value={kpis.deficient_count} tone={kpis.deficient_count > 0 ? 'bad' : undefined} />
        <Kpi label="Material weak"    value={kpis.material_weakness_total} tone={kpis.material_weakness_total > 0 ? 'bad' : undefined} />
        <Kpi label="Excepted"         value={kpis.excepted_count} tone={kpis.excepted_count > 0 ? 'warn' : undefined} />
        <Kpi label="SLA breached"     value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Floor flags"      value={kpis.floor_flag_total} tone={kpis.floor_flag_total > 0 ? 'warn' : undefined} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Defined: <span className="font-semibold text-[#1a3a5c]">{kpis.defined_count}</span></span>
        <span>Design: <span className="font-semibold text-[#1a3a5c]">{kpis.design_count}</span></span>
        <span>Walkthrough: <span className="font-semibold text-[#1a3a5c]">{kpis.walkthrough_count}</span></span>
        <span>ToD planned: <span className="font-semibold text-[#a06200]">{kpis.tod_planned_count}</span></span>
        <span>ToD evidence: <span className="font-semibold text-[#a06200]">{kpis.tod_evidence_count}</span></span>
        <span>ToD executed: <span className="font-semibold text-[#a06200]">{kpis.tod_executed_count}</span></span>
        <span>ToOE planned: <span className="font-semibold text-[#a06200]">{kpis.tooe_planned_count}</span></span>
        <span>ToOE evidence: <span className="font-semibold text-[#a06200]">{kpis.tooe_evidence_count}</span></span>
        <span>ToOE executed: <span className="font-semibold text-[#a06200]">{kpis.tooe_executed_count}</span></span>
        <span>Deficiency: <span className="font-semibold text-[#1f6b3a]">{kpis.deficiency_count}</span></span>
        <span>Remediated: <span className="font-semibold text-[#1f6b3a]">{kpis.remediation_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Re-test: <span className="font-semibold text-[#1f6b3a]">{kpis.re_test_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Design avg: <span className="font-semibold text-[#1a3a5c]">{kpis.design_avg}/130</span></span>
        <span>ToD avg: <span className="font-semibold text-[#1a3a5c]">{kpis.tod_avg}/130</span></span>
        <span>ToOE avg: <span className="font-semibold text-[#1a3a5c]">{kpis.tooe_avg}/130</span></span>
        <span>Evidence avg: <span className="font-semibold text-[#1a3a5c]">{kpis.evidence_avg}/130</span></span>
        <span>W118: <span className="font-semibold text-[#1a3a5c]">{kpis.w118_bridged_count}</span></span>
        <span>W119: <span className="font-semibold text-[#1a3a5c]">{kpis.w119_bridged_count}</span></span>
        <span>W120: <span className="font-semibold text-[#1a3a5c]">{kpis.w120_bridged_count}</span></span>
        <span>W113: <span className="font-semibold text-[#1a3a5c]">{kpis.w113_bridged_count}</span></span>
        <span>W114: <span className="font-semibold text-[#1a3a5c]">{kpis.w114_bridged_count}</span></span>
        <span>W115: <span className="font-semibold text-[#1a3a5c]">{kpis.w115_bridged_count}</span></span>
        <span>W116: <span className="font-semibold text-[#1a3a5c]">{kpis.w116_bridged_count}</span></span>
        <span>W117: <span className="font-semibold text-[#1a3a5c]">{kpis.w117_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
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

      {/* Row 2: lifecycle stages */}
      <div className="mb-2 flex flex-wrap gap-1.5">
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

      {/* Row 3: classifications */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_CLASSIFICATION.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#7a0e0e] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 4: frameworks */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_FRAMEWORK.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Control #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Framework</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Classification</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Design</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Evidence</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Severity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Flags</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.control_health_band_live ?? r.control_health_band ?? 'green'];
                const design = r.design_documentation_completeness_index_live ?? r.design_documentation_completeness_index ?? 0;
                const evidence = r.evidence_coverage_index_live ?? r.evidence_coverage_index ?? 0;
                const flags = r.floor_flag_count_live ?? 0;
                const sev = r.deficiency_severity ?? 'none';
                const sevBad = sev === 'material_weakness';
                const sevWarn = sev === 'significant_deficiency';
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.control_number}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.period_label}</div>
                      {r.is_reportable_flag ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span> : null}
                      {r.external_auditor_sign_off ? <span className="ml-1 text-[9px] font-semibold text-[#1f5b3a]">EXT</span> : null}
                      {r.material_weakness_suspected ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">MW</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#1a3a5c]">
                      {r.control_framework ? r.control_framework.replace(/_/g, ' ') : '-'}
                      {r.framework_control_ref ? <div className="text-[10px] text-[#6b7685] font-mono">{r.framework_control_ref}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
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
                    <td className={`px-3 py-2 text-center tabular-nums ${design >= 100 ? 'text-[#1f5b3a]' : design >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {design}/130
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${evidence >= 100 ? 'text-[#1f5b3a]' : evidence >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {evidence}/130
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${sevBad ? 'text-[#9b1f1f] font-semibold' : sevWarn ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {sev.replace(/_/g, ' ')}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${flags >= 2 ? 'text-[#9b1f1f] font-semibold' : flags === 1 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>
                      {flags}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No controls match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} regulatorView={!!regulatorView} />
      )}

      {showPropose && (
        <ProposeModal onClose={() => setShowPropose(false)} onSubmit={propose} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct, regulatorView,
}: {
  row: CeaRow;
  events: CeaEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CeaRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const design   = row.design_documentation_completeness_index_live ?? row.design_documentation_completeness_index;
  const tod      = row.tod_test_completeness_index_live ?? row.tod_test_completeness_index;
  const tooe     = row.tooe_test_completeness_index_live ?? row.tooe_test_completeness_index;
  const evidence = row.evidence_coverage_index_live ?? row.evidence_coverage_index;

  const ACTIVE_NON_TERMINAL: CeaStatus[] = [
    'control_defined', 'design_documented', 'walkthrough_completed',
    'tod_test_planned', 'tod_evidence_collected', 'tod_test_executed',
    'tooe_test_planned', 'tooe_evidence_collected', 'tooe_test_executed',
    'deficiency_assessed', 'remediation_completed', 'excepted', 'suspended',
    'remediated_re_test',
  ];
  const SUSPEND_FROM: CeaStatus[] = [
    'design_documented', 'walkthrough_completed',
    'tod_test_planned', 'tod_evidence_collected', 'tod_test_executed',
    'tooe_test_planned', 'tooe_evidence_collected', 'tooe_test_executed',
    'deficiency_assessed', 'remediation_completed',
  ];
  const EXCEPT_FROM: CeaStatus[] = SUSPEND_FROM;
  const RE_TEST_FROM: CeaStatus[] = [
    'tod_test_executed', 'tooe_test_executed', 'deficiency_assessed',
    'remediation_completed', 'remediated_re_test',
  ];
  const FLAG_FROM: CeaStatus[] = ACTIVE_NON_TERMINAL;

  const canSuspend  = SUSPEND_FROM.includes(row.chain_status);
  const canExcept   = EXCEPT_FROM.includes(row.chain_status);
  const canFlag     = FLAG_FROM.includes(row.chain_status);
  const canRetest   = RE_TEST_FROM.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#0c2a4d] text-white hover:bg-[#1a3a5c]'
      : tone === 'danger'
        ? 'bg-[#7a0e0e] text-white hover:bg-[#9b1f1f]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-white border border-[#d8dde6] text-[#1a3a5c] hover:bg-[#f3f5f9]';
    return (
      <button
        key={action}
        onClick={() => onAct(action, row)}
        className={`rounded px-3 py-1.5 text-[11px] font-semibold ${cls}`}
        title={ACTION_LABEL[action]}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className="w-full max-w-3xl overflow-y-auto bg-[#f3f5f9] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">
              {row.control_classification} {'•'} {row.current_tier}
              {row.control_framework ? <> {'•'} {row.control_framework.replace(/_/g, ' ')}</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.control_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'Control-environment audit'} {'•'} {row.period_label}
              {row.period_start && row.period_end && (
                <> {'•'} {row.period_start} {'→'} {row.period_end}</>
              )}
              {row.framework_control_ref ? <> {'•'} <span className="font-mono">{row.framework_control_ref}</span></> : null}
            </p>
          </div>
          <button onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Design" value={`${design}/130`} tone={design >= 100 ? 'ok' : design >= 60 ? 'warn' : 'bad'} />
          <Kpi label="ToD" value={`${tod}/130`} tone={tod >= 100 ? 'ok' : tod >= 60 ? 'warn' : 'bad'} />
          <Kpi label="ToOE" value={`${tooe}/130`} tone={tooe >= 100 ? 'ok' : tooe >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Evidence" value={`${evidence}/130`} tone={evidence >= 100 ? 'ok' : evidence >= 60 ? 'warn' : 'bad'} />
        </div>

        {/* ToD / ToOE outcomes */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ToD sample</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.tod_sample_size}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ToD pass %</div>
            <div className={`font-mono text-[12px] ${row.tod_passed ? 'text-[#1f5b3a]' : 'text-[#9b1f1f] font-semibold'}`}>{row.tod_pass_rate_pct}%</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ToOE sample</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.tooe_sample_size}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ToOE pass %</div>
            <div className={`font-mono text-[12px] ${row.tooe_passed ? 'text-[#1f5b3a]' : 'text-[#9b1f1f] font-semibold'}`}>{row.tooe_pass_rate_pct}%</div>
          </div>
        </div>

        {/* Bridges + flags */}
        <div className="mb-3 grid grid-cols-2 gap-3 rounded border border-[#d8dde6] bg-white p-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#6b7685]">Bridges</div>
            <ul className="space-y-0.5 text-[11px] text-[#4a5568]">
              <li>W118 audit chain: <span className={row.bridges_to_w118_audit_chain_live ? 'text-[#1f5b3a] font-semibold' : 'text-[#9b1f1f] font-semibold'}>
                {row.bridges_to_w118_audit_chain_live ? 'BRIDGED (mandatory)' : 'MISSING (mandatory)'}
              </span></li>
              <li>W119 regulator export: <span className={row.bridges_to_w119_regulator_export_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w119_regulator_export_chain_live ? 'bridged' : '-'}</span></li>
              <li>W120 reconciliation attest: <span className={row.bridges_to_w120_reconciliation_attestation_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w120_reconciliation_attestation_chain_live ? 'bridged' : '-'}</span></li>
              <li>W113 EVM: <span className={row.bridges_to_w113_evm_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w113_evm_chain_live ? 'bridged' : '-'}</span></li>
              <li>W114 doc control: <span className={row.bridges_to_w114_doc_control_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w114_doc_control_chain_live ? 'bridged' : '-'}</span></li>
              <li>W115 submittal: <span className={row.bridges_to_w115_submittal_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w115_submittal_chain_live ? 'bridged' : '-'}</span></li>
              <li>W116 RFI: <span className={row.bridges_to_w116_rfi_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w116_rfi_chain_live ? 'bridged' : '-'}</span></li>
              <li>W117 change order: <span className={row.bridges_to_w117_change_order_chain_live ? 'text-[#1f5b3a]' : 'text-[#6b7685]'}>{row.bridges_to_w117_change_order_chain_live ? 'bridged' : '-'}</span></li>
            </ul>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#6b7685]">Floor flags ({row.floor_flag_count_live ?? 0})</div>
            <ul className="space-y-0.5 text-[11px] text-[#4a5568]">
              <li>Material weakness suspected: <span className={row.material_weakness_suspected ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.material_weakness_suspected ? 'YES' : 'no'}</span></li>
              <li>Regulator audit in progress: <span className={row.regulator_audit_in_progress ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.regulator_audit_in_progress ? 'YES' : 'no'}</span></li>
              <li>SOC2 Type II period open: <span className={row.soc2_type2_period_open ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.soc2_type2_period_open ? 'YES' : 'no'}</span></li>
              <li>ISO27001 surveillance due: <span className={row.iso27001_surveillance_audit_due ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.iso27001_surveillance_audit_due ? 'YES' : 'no'}</span></li>
              <li>SOX 404 attestation pending: <span className={row.sox_404_attestation_pending ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.sox_404_attestation_pending ? 'YES' : 'no'}</span></li>
            </ul>
            <div className="mt-2 text-[10px] text-[#6b7685]">Remediation: <span className="font-mono text-[#1a3a5c]">{row.remediation_progress_pct}%</span></div>
            <div className="mt-1 text-[10px] text-[#6b7685]">Authority: <span className="font-mono text-[#1a3a5c]">{row.authority_required_live ?? row.authority_required ?? '-'}</span></div>
            <div className="mt-1 text-[10px] text-[#6b7685]">Days to quarterly cutoff: <span className="font-mono text-[#1a3a5c]">{row.days_to_quarterly_cutoff_live ?? row.days_to_quarterly_cutoff}</span> {'•'} annual audit: <span className="font-mono text-[#1a3a5c]">{row.days_to_annual_audit_live ?? row.days_to_annual_audit}</span></div>
          </div>
        </div>

        {/* Timestamps */}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px] text-[#4a5568]">
          <div>Defined: {fmtDate(row.control_defined_at)}</div>
          <div>Design documented: {fmtDate(row.design_documented_at)}</div>
          <div>Walkthrough completed: {fmtDate(row.walkthrough_completed_at)}</div>
          <div>ToD planned: {fmtDate(row.tod_test_planned_at)}</div>
          <div>ToD evidence: {fmtDate(row.tod_evidence_collected_at)}</div>
          <div>ToD executed: {fmtDate(row.tod_test_executed_at)}</div>
          <div>ToOE planned: {fmtDate(row.tooe_test_planned_at)}</div>
          <div>ToOE evidence: {fmtDate(row.tooe_evidence_collected_at)}</div>
          <div>ToOE executed: {fmtDate(row.tooe_test_executed_at)}</div>
          <div>Deficiency assessed: {fmtDate(row.deficiency_assessed_at)}</div>
          <div>Remediation completed: {fmtDate(row.remediation_completed_at)}</div>
          <div>Archived: {fmtDate(row.archived_at)}</div>
          {row.deficient_at && <div>Deficient: <span className="font-semibold text-[#9b1f1f]">{fmtDate(row.deficient_at)}</span></div>}
          {row.excepted_at && <div>Excepted: {fmtDate(row.excepted_at)}</div>}
          {row.suspended_at && <div>Suspended: {fmtDate(row.suspended_at)}</div>}
          {row.remediated_re_test_at && <div>Re-test: {fmtDate(row.remediated_re_test_at)}</div>}
          {row.regulator_crossed_at && <div>Regulator crossed: <span className="font-semibold text-[#9b1f1f]">{fmtDate(row.regulator_crossed_at)}</span></div>}
          {row.regulator_inbox_ref && <div>Regulator inbox: <span className="font-mono text-[10px]">{row.regulator_inbox_ref}</span></div>}
          {row.regulator_ref && <div>Regulator ref: <span className="font-mono text-[10px]">{row.regulator_ref}</span></div>}
          {row.external_auditor_firm && <div>External auditor: <span className="font-mono text-[10px]">{row.external_auditor_firm}</span></div>}
          {row.external_auditor_engagement_ref && <div>Engagement ref: <span className="font-mono text-[10px]">{row.external_auditor_engagement_ref}</span></div>}
        </div>

        {/* Action buttons */}
        <div className="mb-3 flex flex-wrap gap-2">
          {!regulatorView && nextAction && renderAct(nextAction, ACTION_LABEL[nextAction].split(' (')[0], 'primary')}
          {!regulatorView && canRetest && renderAct('initiate-re-test', 'Initiate re-test', 'amber')}
          {!regulatorView && canSuspend && renderAct('suspend', 'Suspend', 'amber')}
          {!regulatorView && canExcept && renderAct('accept-with-exception', 'Accept w/ exception', 'amber')}
          {!regulatorView && canFlag && renderAct('flag-deficient', 'FLAG DEFICIENT (SIGNATURE)', 'danger')}
        </div>

        {/* Event log */}
        <div className="rounded border border-[#d8dde6] bg-white">
          <div className="border-b border-[#e3e7ec] px-3 py-2 text-[11px] font-semibold text-[#0c2a4d]">Event log ({events.length})</div>
          <ul className="divide-y divide-[#e3e7ec] text-[11px]">
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[#1a3a5c]">{e.event_type}</span>
                  <span className="text-[#6b7685]">{fmtDate(e.created_at)}</span>
                </div>
                <div className="text-[#4a5568]">
                  {e.from_status} {'→'} {e.to_status}
                  {e.from_tier && e.to_tier && e.from_tier !== e.to_tier ? ` ${'•'} ${e.from_tier} → ${e.to_tier}` : ''}
                </div>
                {e.notes && <div className="text-[#6b7685]">{e.notes}</div>}
              </li>
            ))}
            {events.length === 0 && (
              <li className="px-3 py-3 text-center text-[#6b7685]">No events yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [classification, setClassification] = useState<CeaClassification>('detective');
  const [framework, setFramework] = useState('coso_2013');
  const [frameworkRef, setFrameworkRef] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [title, setTitle] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [flagMaterial, setFlagMaterial] = useState(false);
  const [flagRegAudit, setFlagRegAudit] = useState(false);
  const [flagSoc2, setFlagSoc2] = useState(false);
  const [flagIso27001, setFlagIso27001] = useState(false);
  const [flagSox404, setFlagSox404] = useState(false);
  const [externalFirm, setExternalFirm] = useState('');
  const [externalRef, setExternalRef] = useState('');

  const submit = () => {
    if (!periodLabel) return;
    onSubmit({
      control_classification: classification,
      control_framework: framework || null,
      framework_control_ref: frameworkRef || null,
      period_label: periodLabel,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      title: title || null,
      reason_code: reasonCode || null,
      material_weakness_suspected:     flagMaterial ? 1 : 0,
      regulator_audit_in_progress:     flagRegAudit ? 1 : 0,
      soc2_type2_period_open:          flagSoc2 ? 1 : 0,
      iso27001_surveillance_audit_due: flagIso27001 ? 1 : 0,
      sox_404_attestation_pending:     flagSox404 ? 1 : 0,
      external_auditor_firm:           externalFirm || null,
      external_auditor_engagement_ref: externalRef || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-base font-semibold text-[#0c2a4d]">Define control-environment audit</h3>
        <div className="space-y-2 text-[12px]">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Classification (INVERTED SLA: bigger = more time)</div>
            <select value={classification} onChange={(e) => setClassification(e.target.value as CeaClassification)} className="w-full rounded border border-[#d8dde6] px-2 py-1">
              <option value="preventive">Preventive (168h)</option>
              <option value="detective">Detective (240h)</option>
              <option value="corrective">Corrective (360h)</option>
              <option value="directive">Directive (480h)</option>
              <option value="governance">Governance (720h)</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Framework</div>
              <select value={framework} onChange={(e) => setFramework(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1">
                <option value="coso_2013">COSO 2013</option>
                <option value="soc2_tsc">SOC 2 TSC</option>
                <option value="iso27001_2022">ISO 27001:2022</option>
                <option value="iso27002_2022">ISO 27002:2022</option>
                <option value="nist_csf_20">NIST CSF 2.0</option>
                <option value="nist_sp_800_53">NIST SP 800-53</option>
                <option value="cmmc_l3">CMMC L3</option>
                <option value="cobit_2019">COBIT 2019</option>
                <option value="itil_4">ITIL 4</option>
                <option value="cis_v8">CIS v8</option>
                <option value="sox_404">SOX 404</option>
                <option value="popia">POPIA</option>
                <option value="king_iv">King IV</option>
                <option value="jse_srl_862">JSE SRL 8.62</option>
              </select>
            </label>
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Framework control ref</div>
              <input value={frameworkRef} onChange={(e) => setFrameworkRef(e.target.value)} placeholder="e.g. CC6.1, A.5.1, PR.AC-1" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
          </div>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Period label (e.g. 2026-Q1, 2026-FY)</div>
            <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Period start</div>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Period end</div>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
          </div>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1" />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Reason code</div>
            <input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="e.g. soc2_type2_routine" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">External auditor firm</div>
              <input value={externalFirm} onChange={(e) => setExternalFirm(e.target.value)} placeholder="e.g. PwC South Africa" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Engagement ref</div>
              <input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="e.g. ENG-2026-OE-ICFR" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
          </div>
          <div className="rounded border border-[#d8dde6] bg-[#f8fafc] p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#6b7685]">
              Floor flags ({'≥'}1 lifts to directive; {'≥'}2 lifts to governance)
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagMaterial} onChange={(e) => setFlagMaterial(e.target.checked)} /> Material weakness suspected</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagRegAudit} onChange={(e) => setFlagRegAudit(e.target.checked)} /> Regulator audit in progress</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagSoc2} onChange={(e) => setFlagSoc2(e.target.checked)} /> SOC 2 Type II period open</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagIso27001} onChange={(e) => setFlagIso27001(e.target.checked)} /> ISO 27001 surveillance audit due</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagSox404} onChange={(e) => setFlagSox404(e.target.checked)} /> SOX 404 attestation pending</label>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Cancel</button>
          <button onClick={submit} className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a3a5c]">Define</button>
        </div>
      </div>
    </div>
  );
}
