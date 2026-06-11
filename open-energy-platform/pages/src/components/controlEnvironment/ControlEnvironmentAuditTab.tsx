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
  [key: string]: unknown;
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

const ALL_STATES = [
  'control_defined', 'design_documented', 'walkthrough_completed',
  'tod_test_planned', 'tod_evidence_collected', 'tod_test_executed',
  'tooe_test_planned', 'tooe_evidence_collected', 'tooe_test_executed',
  'deficiency_assessed', 'remediation_completed', 'archived',
] as const;

const BRANCH_STATES = [
  'deficient', 'excepted', 'suspended', 'remediated_re_test',
] as const;

const FILTERS = [
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
  { key: 'excepted',               label: 'Excepted' },
  { key: 'suspended',              label: 'Suspended' },
  { key: 'remediated_re_test',     label: 'Re-test' },
  { key: 'cls:preventive',  label: 'Preventive (168h)' },
  { key: 'cls:detective',   label: 'Detective (240h)' },
  { key: 'cls:corrective',  label: 'Corrective (360h)' },
  { key: 'cls:directive',   label: 'Directive (480h)' },
  { key: 'cls:governance',  label: 'Governance (720h)' },
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

function getActions(row: CeaRow, regulatorView: boolean): ChainAction[] {
  if (regulatorView) return [];

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
  const RE_TEST_FROM: CeaStatus[] = [
    'tod_test_executed', 'tooe_test_executed', 'deficiency_assessed',
    'remediation_completed', 'remediated_re_test',
  ];

  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'control_defined') {
    actions.push({
      key: 'document-design',
      label: 'Document design',
      tone: 'primary',
      description: 'control_owner — 12 design attributes',
      fields: [
        { key: 'control_framework', label: 'Framework (coso_2013/soc2_tsc/iso27001_2022/nist_csf_20/sox_404/popia/king_iv/jse_srl_862...)', type: 'text', required: false },
        { key: 'framework_control_ref', label: 'Framework control ref (e.g. CC6.1, A.5.1, PR.AC-1)', type: 'text', required: false },
        { key: 'design_checklist', label: 'Design attributes confirmed (description/objective/party/frequency/inputs/outputs/IPE/mode/COSO/ISO/SOC2/SoA)', type: 'textarea', required: false },
      ],
    });
  } else if (s === 'design_documented') {
    actions.push({
      key: 'complete-walkthrough',
      label: 'Complete walkthrough',
      tone: 'primary',
      description: 'control_owner — evidence attached',
      fields: [
        { key: 'walkthrough_notes', label: 'Walkthrough evidence notes', type: 'textarea', required: false },
      ],
    });
  } else if (s === 'walkthrough_completed') {
    actions.push({
      key: 'plan-tod-test',
      label: 'Plan ToD test',
      tone: 'primary',
      description: 'control_owner — sample size + population',
      fields: [
        { key: 'tod_sample_size', label: 'ToD sample size', type: 'text', required: true },
      ],
    });
  } else if (s === 'tod_test_planned') {
    actions.push({
      key: 'collect-tod-evidence',
      label: 'Collect ToD evidence',
      tone: 'primary',
      description: 'control_owner — attach + sign',
      fields: [
        { key: 'tod_sample_size', label: 'ToD sample size (final)', type: 'text', required: false },
      ],
    });
  } else if (s === 'tod_evidence_collected') {
    actions.push({
      key: 'execute-tod-test',
      label: 'Execute ToD test',
      tone: 'primary',
      description: 'process_owner — pass rate + exceptions',
      fields: [
        { key: 'tod_pass_rate_pct', label: 'ToD pass rate %', type: 'text', required: true },
        { key: 'tod_exceptions_logged', label: 'ToD exceptions logged (0/1)', type: 'text', required: false },
        { key: 'tod_passed', label: 'ToD PASSED (0/1)', type: 'text', required: true },
        { key: 'tod_reviewer_signoff', label: 'Reviewer signed off (0/1)', type: 'text', required: false },
      ],
    });
  } else if (s === 'tod_test_executed') {
    actions.push({
      key: 'plan-tooe-test',
      label: 'Plan ToOE test',
      tone: 'primary',
      description: 'process_owner — sample over period',
      fields: [
        { key: 'tooe_sample_size', label: 'ToOE sample size (across full period)', type: 'text', required: true },
      ],
    });
  } else if (s === 'tooe_test_planned') {
    actions.push({
      key: 'collect-tooe-evidence',
      label: 'Collect ToOE evidence',
      tone: 'primary',
      description: 'process_owner — attach + sign',
      fields: [
        { key: 'tooe_sample_size', label: 'ToOE sample size (final)', type: 'text', required: false },
      ],
    });
  } else if (s === 'tooe_evidence_collected') {
    actions.push({
      key: 'execute-tooe-test',
      label: 'Execute ToOE test',
      tone: 'primary',
      description: 'process_owner — pass rate + exceptions',
      fields: [
        { key: 'tooe_pass_rate_pct', label: 'ToOE pass rate %', type: 'text', required: true },
        { key: 'tooe_exceptions_logged', label: 'ToOE exceptions logged (0/1)', type: 'text', required: false },
        { key: 'tooe_passed', label: 'ToOE PASSED (0/1)', type: 'text', required: true },
        { key: 'tooe_reviewer_signoff', label: 'Reviewer signed off (0/1)', type: 'text', required: false },
      ],
    });
  } else if (s === 'tooe_test_executed') {
    actions.push({
      key: 'assess-deficiency',
      label: 'Assess deficiency',
      tone: 'primary',
      description: 'CISO — severity + material-weakness',
      fields: [
        { key: 'deficiency_severity', label: 'Deficiency severity (none/control_deficiency/significant_deficiency/material_weakness)', type: 'text', required: true },
      ],
    });
  } else if (s === 'deficiency_assessed') {
    actions.push({
      key: 'complete-remediation',
      label: 'Complete remediation',
      tone: 'primary',
      description: 'CISO — progress to 100%',
      fields: [
        { key: 'remediation_progress_pct', label: 'Remediation progress % (0-100)', type: 'text', required: true },
      ],
    });
  } else if (s === 'remediation_completed') {
    actions.push({
      key: 'archive',
      label: 'Archive',
      tone: 'primary',
      description: 'audit_committee_chair — HARD terminal; ext auditor signoff crosses regulator EVERY tier',
      fields: [
        { key: 'external_auditor_sign_off', label: 'External auditor sign-off (0/1). NOTE: crosses regulator EVERY tier when 1.', type: 'text', required: true },
        { key: 'external_auditor_firm', label: 'External auditor firm (e.g. PwC South Africa)', type: 'text', required: false },
        { key: 'external_auditor_engagement_ref', label: 'Engagement ref (e.g. ENG-2026-OE-ICFR)', type: 'text', required: false },
        { key: 'external_auditor_jwt_jti', label: 'External auditor JWT jti (signed token id)', type: 'text', required: false },
        { key: 'notes', label: 'Archive notes (audit_committee_chair — HARD terminal)', type: 'textarea', required: false },
      ],
    });
  } else if (s === 'suspended') {
    actions.push({
      key: 'assess-deficiency',
      label: 'Resume via assess deficiency',
      tone: 'primary',
      description: 'CISO — resume from suspended',
      fields: [
        { key: 'deficiency_severity', label: 'Deficiency severity (none/control_deficiency/significant_deficiency/material_weakness)', type: 'text', required: true },
      ],
    });
  } else if (s === 'remediated_re_test') {
    actions.push({
      key: 'plan-tooe-test',
      label: 'Plan ToOE test (re-test)',
      tone: 'primary',
      description: 'process_owner — sample over period',
      fields: [
        { key: 'tooe_sample_size', label: 'ToOE sample size (across full period)', type: 'text', required: true },
      ],
    });
  }

  if (RE_TEST_FROM.includes(s)) {
    actions.push({
      key: 'initiate-re-test',
      label: 'Initiate re-test',
      tone: 'warn',
      description: 'CISO — after failed ToD/ToOE/deficiency/remediation',
      fields: [
        { key: 'notes', label: 'Re-test note (back to remediated_re_test; ToOE replan next)', type: 'textarea', required: false },
      ],
    });
  }

  if (SUSPEND_FROM.includes(s)) {
    actions.push({
      key: 'suspend',
      label: 'Suspend',
      tone: 'warn',
      description: 'process_owner — regulator-audit-in-progress; resume via assess',
      fields: [
        { key: 'suspend_reason', label: 'Suspend reason (regulator-audit-in-progress?)', type: 'textarea', required: true },
        { key: 'regulator_audit_in_progress', label: 'Regulator audit in progress (0/1)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'accept-with-exception',
      label: 'Accept with exception',
      tone: 'warn',
      description: 'CISO — crosses regulator on directive + governance only',
      fields: [
        { key: 'exception_reason', label: 'Exception reason. NOTE: crosses regulator on directive + governance only.', type: 'textarea', required: true },
      ],
    });
  }

  if (ACTIVE_NON_TERMINAL.includes(s)) {
    actions.push({
      key: 'flag-deficient',
      label: 'FLAG DEFICIENT (SIGNATURE)',
      tone: 'danger',
      description: 'admin — SIGNATURE EVERY tier when material weakness (SSAE 18 + ISA 265 + JSE 8.62 + s30)',
      cascadeTo: ['regulator', 'admin'],
      fields: [
        { key: 'deficient_reason', label: 'Deficient reason. NOTE: SIGNATURE — crosses regulator EVERY tier when material_weakness_suspected (SSAE 18 + ISA 265 + JSE 8.62 + s30).', type: 'textarea', required: true },
        { key: 'deficiency_severity', label: 'Deficiency severity (control_deficiency/significant_deficiency/material_weakness)', type: 'text', required: true },
      ],
    });
  }

  return actions;
}

function renderDetail(row: CeaRow): React.ReactNode {
  const design   = row.design_documentation_completeness_index_live ?? row.design_documentation_completeness_index ?? 0;
  const tod      = row.tod_test_completeness_index_live ?? row.tod_test_completeness_index ?? 0;
  const tooe     = row.tooe_test_completeness_index_live ?? row.tooe_test_completeness_index ?? 0;
  const evidence = row.evidence_coverage_index_live ?? row.evidence_coverage_index ?? 0;
  const flags    = row.floor_flag_count_live ?? 0;
  const sev      = row.deficiency_severity ?? 'none';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Completeness indexes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <KpiTile label="Design" value={`${design}/130`} tone={design >= 100 ? 'ok' : design >= 60 ? 'warn' : 'bad'} />
        <KpiTile label="ToD" value={`${tod}/130`} tone={tod >= 100 ? 'ok' : tod >= 60 ? 'warn' : 'bad'} />
        <KpiTile label="ToOE" value={`${tooe}/130`} tone={tooe >= 100 ? 'ok' : tooe >= 60 ? 'warn' : 'bad'} />
        <KpiTile label="Evidence" value={`${evidence}/130`} tone={evidence >= 100 ? 'ok' : evidence >= 60 ? 'warn' : 'bad'} />
      </div>

      {/* ToD / ToOE outcomes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 10 }}>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>ToD sample</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: TX1 }}>{row.tod_sample_size}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>ToD pass %</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: row.tod_passed ? GOOD : BAD, fontWeight: row.tod_passed ? undefined : 700 }}>{row.tod_pass_rate_pct}%</div>
        </div>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>ToOE sample</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: TX1 }}>{row.tooe_sample_size}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>ToOE pass %</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: row.tooe_passed ? GOOD : BAD, fontWeight: row.tooe_passed ? undefined : 700 }}>{row.tooe_pass_rate_pct}%</div>
        </div>
      </div>

      {/* Bridges + floor flags */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 10 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3, marginBottom: 4 }}>Bridges</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: TX2 }}>
            <span>W118 audit chain: <span style={{ color: row.bridges_to_w118_audit_chain_live ? GOOD : BAD, fontWeight: 700 }}>{row.bridges_to_w118_audit_chain_live ? 'BRIDGED (mandatory)' : 'MISSING (mandatory)'}</span></span>
            <span>W119 regulator export: <span style={{ color: row.bridges_to_w119_regulator_export_chain_live ? GOOD : TX3 }}>{row.bridges_to_w119_regulator_export_chain_live ? 'bridged' : '-'}</span></span>
            <span>W120 reconciliation attest: <span style={{ color: row.bridges_to_w120_reconciliation_attestation_chain_live ? GOOD : TX3 }}>{row.bridges_to_w120_reconciliation_attestation_chain_live ? 'bridged' : '-'}</span></span>
            <span>W113 EVM: <span style={{ color: row.bridges_to_w113_evm_chain_live ? GOOD : TX3 }}>{row.bridges_to_w113_evm_chain_live ? 'bridged' : '-'}</span></span>
            <span>W114 doc control: <span style={{ color: row.bridges_to_w114_doc_control_chain_live ? GOOD : TX3 }}>{row.bridges_to_w114_doc_control_chain_live ? 'bridged' : '-'}</span></span>
            <span>W115 submittal: <span style={{ color: row.bridges_to_w115_submittal_chain_live ? GOOD : TX3 }}>{row.bridges_to_w115_submittal_chain_live ? 'bridged' : '-'}</span></span>
            <span>W116 RFI: <span style={{ color: row.bridges_to_w116_rfi_chain_live ? GOOD : TX3 }}>{row.bridges_to_w116_rfi_chain_live ? 'bridged' : '-'}</span></span>
            <span>W117 change order: <span style={{ color: row.bridges_to_w117_change_order_chain_live ? GOOD : TX3 }}>{row.bridges_to_w117_change_order_chain_live ? 'bridged' : '-'}</span></span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3, marginBottom: 4 }}>Floor flags ({flags})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: TX2 }}>
            <span>Material weakness suspected: <span style={{ color: row.material_weakness_suspected ? BAD : TX3, fontWeight: row.material_weakness_suspected ? 700 : undefined }}>{row.material_weakness_suspected ? 'YES' : 'no'}</span></span>
            <span>Regulator audit in progress: <span style={{ color: row.regulator_audit_in_progress ? BAD : TX3, fontWeight: row.regulator_audit_in_progress ? 700 : undefined }}>{row.regulator_audit_in_progress ? 'YES' : 'no'}</span></span>
            <span>SOC2 Type II period open: <span style={{ color: row.soc2_type2_period_open ? BAD : TX3, fontWeight: row.soc2_type2_period_open ? 700 : undefined }}>{row.soc2_type2_period_open ? 'YES' : 'no'}</span></span>
            <span>ISO27001 surveillance due: <span style={{ color: row.iso27001_surveillance_audit_due ? BAD : TX3, fontWeight: row.iso27001_surveillance_audit_due ? 700 : undefined }}>{row.iso27001_surveillance_audit_due ? 'YES' : 'no'}</span></span>
            <span>SOX 404 attestation pending: <span style={{ color: row.sox_404_attestation_pending ? BAD : TX3, fontWeight: row.sox_404_attestation_pending ? 700 : undefined }}>{row.sox_404_attestation_pending ? 'YES' : 'no'}</span></span>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: TX3 }}>
            Remediation: <span style={{ fontFamily: MONO, color: TX1 }}>{row.remediation_progress_pct}%</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 10, color: TX3 }}>
            Authority: <span style={{ fontFamily: MONO, color: TX1 }}>{row.authority_required_live ?? row.authority_required ?? '-'}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 10, color: TX3 }}>
            Days to quarterly cutoff: <span style={{ fontFamily: MONO, color: TX1 }}>{row.days_to_quarterly_cutoff_live ?? row.days_to_quarterly_cutoff}</span>
            {' • '}
            annual audit: <span style={{ fontFamily: MONO, color: TX1 }}>{row.days_to_annual_audit_live ?? row.days_to_annual_audit}</span>
          </div>
        </div>
      </div>

      {/* Deficiency severity */}
      {sev !== 'none' && (
        <DetailPair label="Deficiency severity" value={sev.replace(/_/g, ' ')} />
      )}
      {row.deficient_reason && (
        <DetailPair label="Deficient reason" value={row.deficient_reason} />
      )}
      {row.exception_reason && (
        <DetailPair label="Exception reason" value={row.exception_reason} />
      )}
      {row.suspend_reason && (
        <DetailPair label="Suspend reason" value={row.suspend_reason} />
      )}

      {/* Key timestamps */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11, color: TX2 }}>
        <DetailPair label="Defined" value={fmtDate(row.control_defined_at)} />
        <DetailPair label="Design documented" value={fmtDate(row.design_documented_at)} />
        <DetailPair label="Walkthrough completed" value={fmtDate(row.walkthrough_completed_at)} />
        <DetailPair label="ToD planned" value={fmtDate(row.tod_test_planned_at)} />
        <DetailPair label="ToD evidence" value={fmtDate(row.tod_evidence_collected_at)} />
        <DetailPair label="ToD executed" value={fmtDate(row.tod_test_executed_at)} />
        <DetailPair label="ToOE planned" value={fmtDate(row.tooe_test_planned_at)} />
        <DetailPair label="ToOE evidence" value={fmtDate(row.tooe_evidence_collected_at)} />
        <DetailPair label="ToOE executed" value={fmtDate(row.tooe_test_executed_at)} />
        <DetailPair label="Deficiency assessed" value={fmtDate(row.deficiency_assessed_at)} />
        <DetailPair label="Remediation completed" value={fmtDate(row.remediation_completed_at)} />
        <DetailPair label="Archived" value={fmtDate(row.archived_at)} />
        {row.deficient_at && <DetailPair label="Deficient" value={fmtDate(row.deficient_at)} />}
        {row.excepted_at && <DetailPair label="Excepted" value={fmtDate(row.excepted_at)} />}
        {row.suspended_at && <DetailPair label="Suspended" value={fmtDate(row.suspended_at)} />}
        {row.remediated_re_test_at && <DetailPair label="Re-test" value={fmtDate(row.remediated_re_test_at)} />}
        {row.regulator_crossed_at && <DetailPair label="Regulator crossed" value={fmtDate(row.regulator_crossed_at)} />}
        {row.regulator_inbox_ref && <DetailPair label="Regulator inbox" value={row.regulator_inbox_ref} />}
        {row.regulator_ref && <DetailPair label="Regulator ref" value={row.regulator_ref} />}
        {row.external_auditor_firm && <DetailPair label="External auditor" value={row.external_auditor_firm} />}
        {row.external_auditor_engagement_ref && <DetailPair label="Engagement ref" value={row.external_auditor_engagement_ref} />}
      </div>
    </div>
  );
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

interface Props {
  regulatorView?: boolean;
}

export function ControlEnvironmentAuditTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<CeaRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'deficient' : 'active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    await api.post(`/control-environment-audit/${rowId}/${key}`, values);
    await load();
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/control-environment-audit/${id}`);
      setExpandedEvents((prev) => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // silently ignore
    }
  }, [expandedEvents]);

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

  // Split filters into groups for rendering
  const filterGroups = [
    FILTERS.slice(0, 12),  // action/priority
    FILTERS.slice(12, 28), // lifecycle stages
    FILTERS.slice(28, 33), // classifications
    FILTERS.slice(33),     // frameworks
  ];

  return (
    <div style={{ fontSize: 12, color: TX1 }}>
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: TX1, margin: 0 }}>Control-environment audit (W121)</h2>
          <p style={{ fontSize: 11, color: TX2, margin: '4px 0 0' }}>
            12-state per-control evidence dossier — Design / ToD / ToOE / deficiency / remediation — against W118 chain + W119 packs + W120 attestations.
            INVERTED SLA HOURS (preventive 168 / detective 240 / corrective 360 / directive 480 / governance 720).
            FLOOR-AT-DIRECTIVE {'>'}=1 flag / FLOOR-AT-GOVERNANCE {'>'}=2 flags. SIGNATURE: flag-deficient EVERY tier when material_weakness_suspected.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 8 }}>
        <KpiTile label="Total"         value={kpis.total} />
        <KpiTile label="Active"        value={kpis.active_count} />
        <KpiTile label="Archived"      value={kpis.archived_count} tone="ok" />
        <KpiTile label="Deficient"     value={kpis.deficient_count} tone={kpis.deficient_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Material weak" value={kpis.material_weakness_total} tone={kpis.material_weakness_total > 0 ? 'bad' : undefined} />
        <KpiTile label="Excepted"      value={kpis.excepted_count} tone={kpis.excepted_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached"  value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Floor flags"   value={kpis.floor_flag_total} tone={kpis.floor_flag_total > 0 ? 'warn' : undefined} />
      </div>

      {/* Drill rail */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', fontSize: 11, color: TX2 }}>
        <span>Defined: <strong style={{ color: TX1 }}>{kpis.defined_count}</strong></span>
        <span>Design: <strong style={{ color: TX1 }}>{kpis.design_count}</strong></span>
        <span>Walkthrough: <strong style={{ color: TX1 }}>{kpis.walkthrough_count}</strong></span>
        <span>ToD planned: <strong style={{ color: WARN }}>{kpis.tod_planned_count}</strong></span>
        <span>ToD evidence: <strong style={{ color: WARN }}>{kpis.tod_evidence_count}</strong></span>
        <span>ToD executed: <strong style={{ color: WARN }}>{kpis.tod_executed_count}</strong></span>
        <span>ToOE planned: <strong style={{ color: WARN }}>{kpis.tooe_planned_count}</strong></span>
        <span>ToOE evidence: <strong style={{ color: WARN }}>{kpis.tooe_evidence_count}</strong></span>
        <span>ToOE executed: <strong style={{ color: WARN }}>{kpis.tooe_executed_count}</strong></span>
        <span>Deficiency: <strong style={{ color: GOOD }}>{kpis.deficiency_count}</strong></span>
        <span>Remediated: <strong style={{ color: GOOD }}>{kpis.remediation_count}</strong></span>
        <span>Suspended: <strong style={{ color: TX3 }}>{kpis.suspended_count}</strong></span>
        <span>Re-test: <strong style={{ color: GOOD }}>{kpis.re_test_count}</strong></span>
        <span>Reportable: <strong style={{ color: BAD }}>{kpis.reportable_total}</strong></span>
        <span>Design avg: <strong style={{ color: TX1 }}>{kpis.design_avg}/130</strong></span>
        <span>ToD avg: <strong style={{ color: TX1 }}>{kpis.tod_avg}/130</strong></span>
        <span>ToOE avg: <strong style={{ color: TX1 }}>{kpis.tooe_avg}/130</strong></span>
        <span>Evidence avg: <strong style={{ color: TX1 }}>{kpis.evidence_avg}/130</strong></span>
        <span>W118: <strong style={{ color: TX1 }}>{kpis.w118_bridged_count}</strong></span>
        <span>W119: <strong style={{ color: TX1 }}>{kpis.w119_bridged_count}</strong></span>
        <span>W120: <strong style={{ color: TX1 }}>{kpis.w120_bridged_count}</strong></span>
        <span>W113: <strong style={{ color: TX1 }}>{kpis.w113_bridged_count}</strong></span>
        <span>W114: <strong style={{ color: TX1 }}>{kpis.w114_bridged_count}</strong></span>
        <span>W115: <strong style={{ color: TX1 }}>{kpis.w115_bridged_count}</strong></span>
        <span>W116: <strong style={{ color: TX1 }}>{kpis.w116_bridged_count}</strong></span>
        <span>W117: <strong style={{ color: TX1 }}>{kpis.w117_bridged_count}</strong></span>
      </div>

      {/* Filter pills — 4 rows */}
      {filterGroups.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {group.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                border: `1px solid ${filter === f.key ? ACC : BORDER}`,
                background: filter === f.key ? ACC : BG1,
                color: filter === f.key ? '#fff' : TX2,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      ))}

      {err && (
        <div style={{ marginBottom: 12, borderRadius: 6, border: `1px solid ${BAD}`, background: 'oklch(0.97 0.04 20)', padding: '8px 12px', fontSize: 12, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '24px 16px', textAlign: 'center', fontSize: 13, color: TX2 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '24px 16px', textAlign: 'center', fontSize: 13, color: TX2 }}>No controls match.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => {
            const design   = row.design_documentation_completeness_index_live ?? row.design_documentation_completeness_index ?? 0;
            const evidence = row.evidence_coverage_index_live ?? row.evidence_coverage_index ?? 0;
            const flags    = row.floor_flag_count_live ?? 0;
            const health   = row.control_health_band_live ?? row.control_health_band ?? 'green';

            const metaLine = (
              <span style={{ fontSize: 11, color: TX2 }}>
                {row.control_classification}
                {' • '}
                {row.current_tier}
                {row.control_framework ? ` • ${row.control_framework.replace(/_/g, ' ')}` : ''}
                {row.framework_control_ref ? <span style={{ fontFamily: MONO }}> [{row.framework_control_ref}]</span> : null}
                {' • '}
                {row.period_label}
                {' • '}
                Design: <strong style={{ color: design >= 100 ? GOOD : design >= 60 ? WARN : BAD }}>{design}/130</strong>
                {' • '}
                Evidence: <strong style={{ color: evidence >= 100 ? GOOD : evidence >= 60 ? WARN : BAD }}>{evidence}/130</strong>
                {' • '}
                Health: <strong style={{ color: health === 'green' ? GOOD : health === 'amber' ? WARN : BAD }}>{health}</strong>
                {flags > 0 ? <span style={{ color: flags >= 2 ? BAD : WARN, fontWeight: 700 }}> • {flags} flag{flags !== 1 ? 's' : ''}</span> : null}
                {row.is_reportable_flag ? <span style={{ color: BAD, fontWeight: 700 }}> • REG</span> : null}
                {row.material_weakness_suspected ? <span style={{ color: BAD, fontWeight: 700 }}> • MW</span> : null}
                {row.external_auditor_sign_off ? <span style={{ color: GOOD, fontWeight: 700 }}> • EXT</span> : null}
              </span>
            );

            return (
              <ChainCard
                key={row.id}
                item={{
                  ...row,
                  sla_breached: !!row.sla_breached_live,
                }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.control_number + (row.title ? ` — ${row.title}` : '')}
                meta={metaLine}
                actions={getActions(row, !!regulatorView)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                onExpand={handleExpand}
                events={expandedEvents[row.id]}
                cascadeTo={row.is_reportable_flag ? ['regulator', 'admin'] : ['admin']}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 11 }}>
      <span style={{ color: TX3 }}>{label}: </span>
      <span style={{ color: TX1, fontFamily: value.length > 40 ? undefined : MONO }}>{value}</span>
    </div>
  );
}

export default ControlEnvironmentAuditTab;
