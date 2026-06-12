// Wave 120 - Reconciliation Attestation.
//
// THIRD Phase-B wave (after W118 audit-chain spine + W119 regulator-export
// packs). Mounted at /admin-platform/workstation?tab=reconciliation-
// attestation for admin write, and /regulator-suite/workstation?tab=
// icfr-attestations for regulator read.
//
// Beats: BlackLine + Trintech Cadency + FloQast + OneStream + Adra +
// FIS Reconciliation Hub + Broadridge + Duco + Gresham Clareti - by
// producing tamper-evident L5 attestations against the W118 chain, with
// CFO + audit-committee + external-auditor sign-off ladders.
//
// 12-state forward + 4 branch lifecycle:
//   attestation_proposed -> scope_defined -> feeds_ingested ->
//     blocks_paired -> variance_computed -> break_classified ->
//     root_cause_logged -> remediation_proposed -> counter_party_signoff ->
//     independent_review -> attestation_signed -> archived (HARD)
//   any non-terminal -> reject -> rejected (regulator EVERY when
//     material_variance_unresolved AND icfr_deficiency_suspected)
//   any non-terminal -> suspend -> suspended (resume to scope_defined)
//   acknowledged or signed -> restate -> restated (quarterly+annual only)
//   any non-terminal -> escalate-to-audit-committee ->
//     escalated_to_audit_committee (SIGNATURE: EVERY tier - ICFR-
//     DEFICIENCY-ATTEST hard line)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger cadence = more prep:
//   daily 24h / weekly 96h / monthly 168h / quarterly 360h / annual 720h.
// FLOOR-AT-QUARTERLY on >=1 of 5 flags; >=2 lifts to annual_audit.
// Flags: material_variance_unresolved / external_auditor_request_active /
// regulator_audit_in_progress / cross_border_feed_break /
// icfr_deficiency_suspected.
//
// SIGNATURE Phase-B regulator crossings:
//   * escalate_to_audit_committee crosses regulator EVERY tier (W120
//     SIGNATURE - ICFR-DEFICIENCY-ATTEST hard line; JSE 8.62 + s30)
//   * reject crosses regulator EVERY tier when
//     material_variance_unresolved AND icfr_deficiency_suspected
//   * restate crosses on quarterly + annual only
//   * sla_breached crosses on quarterly + annual only
//   * sign_attestation NEVER crosses (internal control)
//
// Write {admin ONLY}. READ all 9 personas. External auditor reads /external/:id
// via signed JWT (NOT mTLS like W119; identity is JWT-bound).
//
// 4-step authority ladder:
//   reconciler -> controller -> CFO -> audit_committee_chair.
//
// 7 bridges: W118 (MANDATORY) + W119 (mandatory) + W113 EVM /
// W114 doc / W115 sub / W116 RFI / W117 CO.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt, confirmDialog } from '../PromptDialog';

type RattStatus =
  | 'attestation_proposed' | 'scope_defined' | 'feeds_ingested'
  | 'blocks_paired' | 'variance_computed' | 'break_classified'
  | 'root_cause_logged' | 'remediation_proposed' | 'counter_party_signoff'
  | 'independent_review' | 'attestation_signed' | 'archived'
  | 'rejected' | 'suspended' | 'restated' | 'escalated_to_audit_committee';

type RattTier =
  | 'daily_tactical' | 'weekly_management' | 'monthly_management'
  | 'quarterly_attestation' | 'annual_audit';
type RattCadence = RattTier;
type RattUrgency = 'low' | 'medium' | 'high' | 'critical';
type RattAuthority = 'reconciler' | 'controller' | 'CFO' | 'audit_committee_chair';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';

interface RattRow {
  id: string;
  attestation_number: string;
  cadence: RattCadence;
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
  parent_attestation_id: string | null;
  material_variance_unresolved: number;
  external_auditor_request_active: number;
  regulator_audit_in_progress: number;
  cross_border_feed_break: number;
  icfr_deficiency_suspected: number;
  feeds_in_scope: number;
  feeds_ingested_count: number;
  feeds_paired_count: number;
  feeds_paired_pct: number;
  feed_sources_csv: string | null;
  total_variance_zar: number;
  materiality_threshold_zar: number;
  net_variance_explained_zar: number;
  unresolved_variance_zar: number;
  variance_explained_pct: number;
  break_classification: string | null;
  break_classified_pct: number;
  root_cause_taxonomy: string | null;
  coso_components_tested: number;
  tsc_categories_tested: number;
  material_weakness_open: number;
  remediation_progress_pct: number;
  remediation_closed_pct: number;
  action_plan_drafted: number;
  owner_assigned: number;
  target_date_set: number;
  evidence_attached: number;
  followup_test_passed: number;
  counter_party_signed_off: number;
  independent_review_passed: number;
  cfo_attestation_signed: number;
  audit_committee_briefed: number;
  current_tier: RattTier;
  authority_required: RattAuthority | null;
  urgency_band: RattUrgency | null;
  attestation_health_band: HealthBand | null;
  reconciliation_completeness_index: number;
  icfr_control_effectiveness_index: number;
  variance_score_index: number;
  remediation_progress_index: number;
  attestation_window_hours: number;
  days_to_quarterly_attestation: number;
  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  suspend_reason: string | null;
  restate_reason: string | null;
  escalation_reason: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  external_auditor_firm: string | null;
  external_auditor_engagement_ref: string | null;
  external_auditor_jwt_jti: string | null;
  chain_status: RattStatus;
  attestation_proposed_at: string | null;
  scope_defined_at: string | null;
  feeds_ingested_at: string | null;
  blocks_paired_at: string | null;
  variance_computed_at: string | null;
  break_classified_at: string | null;
  root_cause_logged_at: string | null;
  remediation_proposed_at: string | null;
  counter_party_signoff_at: string | null;
  independent_review_at: string | null;
  attestation_signed_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  suspended_at: string | null;
  restated_at: string | null;
  escalated_at: string | null;
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
  // LIVE decoration battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_hours_remaining_live?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  urgency_band_live?: RattUrgency;
  authority_required_live?: RattAuthority;
  attestation_window_hours_live?: number;
  days_to_quarterly_attestation_live?: number;
  floor_flag_count_live?: number;
  floor_at_quarterly_live?: boolean;
  floor_at_annual_live?: boolean;
  reconciliation_completeness_index_live?: number;
  icfr_control_effectiveness_index_live?: number;
  variance_score_index_live?: number;
  remediation_progress_index_live?: number;
  attestation_health_band_live?: HealthBand;
  bridges_to_w113_evm_chain_live?: boolean;
  bridges_to_w114_doc_control_chain_live?: boolean;
  bridges_to_w115_submittal_chain_live?: boolean;
  bridges_to_w116_rfi_chain_live?: boolean;
  bridges_to_w117_change_order_chain_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
  bridges_to_w119_regulator_export_chain_live?: boolean;
}

interface RattEvent {
  id: string;
  attestation_id: string;
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

const STATE_TONE: Record<RattStatus, { bg: string; fg: string; label: string }> = {
  attestation_proposed:          { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  scope_defined:                 { bg: 'oklch(0.94 0.006 250)', fg: 'oklch(0.46 0.16 55)', label: 'Scope defined' },
  feeds_ingested:                { bg: 'oklch(0.94 0.006 250)', fg: 'oklch(0.46 0.16 55)', label: 'Feeds ingested' },
  blocks_paired:                 { bg: 'oklch(0.94 0.006 250)', fg: 'oklch(0.46 0.16 55)', label: 'Blocks paired' },
  variance_computed:             { bg: '#fff4d6', fg: '#a06200', label: 'Variance computed' },
  break_classified:              { bg: '#fff4d6', fg: '#a06200', label: 'Break classified' },
  root_cause_logged:             { bg: '#fff4d6', fg: '#a06200', label: 'Root cause logged' },
  remediation_proposed:          { bg: '#fff4d6', fg: '#a06200', label: 'Remediation proposed' },
  counter_party_signoff:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Counter-party sign-off' },
  independent_review:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Independent review' },
  attestation_signed:            { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Attestation signed' },
  archived:                      { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  rejected:                      { bg: '#7a0e0e', fg: '#fff',    label: 'Rejected' },
  suspended:                     { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
  restated:                      { bg: '#fff4d6', fg: '#a06200', label: 'Restated' },
  escalated_to_audit_committee:  { bg: '#7a0e0e', fg: '#fff',    label: 'Escalated to AC' },
};

const TIER_TONE: Record<RattTier, { bg: string; fg: string; label: string }> = {
  daily_tactical:        { bg: '#e3e7ec', fg: '#557',    label: 'Daily' },
  weekly_management:     { bg: 'oklch(0.94 0.006 250)', fg: 'oklch(0.46 0.16 55)', label: 'Weekly' },
  monthly_management:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Monthly' },
  quarterly_attestation: { bg: '#fff4d6', fg: '#a06200', label: 'Quarterly' },
  annual_audit:          { bg: '#7a0e0e', fg: '#fff',    label: 'Annual audit' },
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
  { key: 'reg_audit',       label: 'Reg audit live' },
  { key: 'cross_border',    label: 'Cross-border break' },
  { key: 'material_var',    label: 'Material variance' },
  { key: 'icfr_def',        label: 'ICFR deficiency' },
  { key: 'ext_auditor',     label: 'Ext. auditor req' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
  { key: 'escalated_ac',    label: 'Escalated to AC' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'attestation_proposed',         label: 'Proposed' },
  { key: 'scope_defined',                label: 'Scope defined' },
  { key: 'feeds_ingested',               label: 'Feeds ingested' },
  { key: 'blocks_paired',                label: 'Blocks paired' },
  { key: 'variance_computed',            label: 'Variance computed' },
  { key: 'break_classified',             label: 'Break classified' },
  { key: 'root_cause_logged',            label: 'Root cause' },
  { key: 'remediation_proposed',         label: 'Remediation' },
  { key: 'counter_party_signoff',        label: 'Sign-off' },
  { key: 'independent_review',           label: 'Review' },
  { key: 'attestation_signed',           label: 'Signed' },
  { key: 'archived',                     label: 'Archived' },
  { key: 'rejected',                     label: 'Rejected' },
  { key: 'suspended',                    label: 'Suspended' },
  { key: 'restated',                     label: 'Restated' },
  { key: 'escalated_to_audit_committee', label: 'Escalated' },
];

const FILTERS_CADENCE: Array<{ key: string; label: string }> = [
  { key: 'cad:daily_tactical',        label: 'Daily (24h)' },
  { key: 'cad:weekly_management',     label: 'Weekly (96h)' },
  { key: 'cad:monthly_management',    label: 'Monthly (168h)' },
  { key: 'cad:quarterly_attestation', label: 'Quarterly (360h)' },
  { key: 'cad:annual_audit',          label: 'Annual audit (720h)' },
];

type ActionKind =
  | 'define-scope' | 'ingest-feeds' | 'pair-blocks'
  | 'compute-variance' | 'classify-break' | 'log-root-cause'
  | 'propose-remediation' | 'get-counter-party-signoff'
  | 'run-independent-review' | 'sign-attestation' | 'archive'
  | 'reject' | 'suspend' | 'resume-from-suspend' | 'restate'
  | 'escalate-to-audit-committee' | 'lift-escalation';

const ACTION_FOR_STATE: Partial<Record<RattStatus, ActionKind>> = {
  attestation_proposed:         'define-scope',
  scope_defined:                'ingest-feeds',
  feeds_ingested:               'pair-blocks',
  blocks_paired:                'compute-variance',
  variance_computed:            'classify-break',
  break_classified:             'log-root-cause',
  root_cause_logged:            'propose-remediation',
  remediation_proposed:         'get-counter-party-signoff',
  counter_party_signoff:        'run-independent-review',
  independent_review:           'sign-attestation',
  attestation_signed:           'archive',
  suspended:                    'resume-from-suspend',
  escalated_to_audit_committee: 'lift-escalation',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'define-scope':                'Define scope (reconciler - feeds, materiality, period)',
  'ingest-feeds':                'Ingest feeds (reconciler - SAP/Oracle/SAGE/STRATE/SWIFT/W118)',
  'pair-blocks':                 'Pair W118 blocks (reconciler - pct paired auto-derived)',
  'compute-variance':            'Compute variance (controller - ZAR totals vs materiality)',
  'classify-break':              'Classify break (controller - 8 break taxonomies)',
  'log-root-cause':              'Log root cause (controller - 12 root-cause taxonomies)',
  'propose-remediation':         'Propose remediation (CFO - action plan + owner + target date)',
  'get-counter-party-signoff':   'Counter-party sign-off (CFO - feed-owner attestations)',
  'run-independent-review':      'Independent review (controller - COSO + TSC sample)',
  'sign-attestation':            'Sign attestation (CFO - ICFR + IAS 8 + COSO sign-off)',
  'archive':                     'Archive (audit_committee_chair - HARD terminal)',
  'reject':                      'REJECT (admin - SIGNATURE EVERY tier when material+ICFR)',
  'suspend':                     'Suspend (CFO - regulator-audit-in-progress; resume to scope)',
  'resume-from-suspend':         'Resume (CFO - back to scope_defined)',
  'restate':                     'Restate (CFO - supersede signed pack; crosses quarterly+)',
  'escalate-to-audit-committee': 'Escalate to AC (W120 SIGNATURE: regulator EVERY tier)',
  'lift-escalation':             'Lift escalation (audit_committee_chair - resume to review)',
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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}R ${(abs / 1_000).toFixed(0)}K`;
  return `${sign}R ${abs.toFixed(0)}`;
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  scope_count: number;
  feeds_count: number;
  paired_count: number;
  variance_count: number;
  break_count: number;
  root_cause_count: number;
  remediation_count: number;
  signoff_count: number;
  review_count: number;
  signed_count: number;
  archived_count: number;
  rejected_count: number;
  suspended_count: number;
  restated_count: number;
  escalated_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w113_bridged_count: number;
  w114_bridged_count: number;
  w115_bridged_count: number;
  w116_bridged_count: number;
  w117_bridged_count: number;
  w118_bridged_count: number;
  w119_bridged_count: number;
  completeness_avg: number;
  icfr_avg: number;
  variance_avg: number;
  remediation_avg: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0, proposed_count: 0, scope_count: 0, feeds_count: 0,
  paired_count: 0, variance_count: 0, break_count: 0, root_cause_count: 0,
  remediation_count: 0, signoff_count: 0, review_count: 0, signed_count: 0,
  archived_count: 0, rejected_count: 0, suspended_count: 0, restated_count: 0,
  escalated_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w113_bridged_count: 0, w114_bridged_count: 0, w115_bridged_count: 0,
  w116_bridged_count: 0, w117_bridged_count: 0, w118_bridged_count: 0,
  w119_bridged_count: 0,
  completeness_avg: 0, icfr_avg: 0, variance_avg: 0, remediation_avg: 0,
};

interface Props {
  // Regulator-suite slice: shows escalated + restated + rejected only,
  // read-only (no admin actions surfaced). Used at /regulator-suite/
  // workstation?tab=icfr-attestations to inspect ICFR-deficiency
  // attestations regulator-relevant under JSE Listings 8.62 +
  // Companies Act s30.
  regulatorView?: boolean;
}

export function ReconciliationAttestationTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<RattRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'escalated_ac' : 'active');
  const [selected, setSelected] = useState<RattRow | null>(null);
  const [events, setEvents] = useState<RattEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RattRow[] } & KpiSummary }>('/reconciliation-attestation');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          scope_count: data.scope_count || 0,
          feeds_count: data.feeds_count || 0,
          paired_count: data.paired_count || 0,
          variance_count: data.variance_count || 0,
          break_count: data.break_count || 0,
          root_cause_count: data.root_cause_count || 0,
          remediation_count: data.remediation_count || 0,
          signoff_count: data.signoff_count || 0,
          review_count: data.review_count || 0,
          signed_count: data.signed_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          suspended_count: data.suspended_count || 0,
          restated_count: data.restated_count || 0,
          escalated_count: data.escalated_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w113_bridged_count: data.w113_bridged_count || 0,
          w114_bridged_count: data.w114_bridged_count || 0,
          w115_bridged_count: data.w115_bridged_count || 0,
          w116_bridged_count: data.w116_bridged_count || 0,
          w117_bridged_count: data.w117_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          w119_bridged_count: data.w119_bridged_count || 0,
          completeness_avg: data.completeness_avg || 0,
          icfr_avg: data.icfr_avg || 0,
          variance_avg: data.variance_avg || 0,
          remediation_avg: data.remediation_avg || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reconciliation attestations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { attestation: RattRow; events: RattEvent[] } }>(`/reconciliation-attestation/${id}`);
      if (res.data?.data?.attestation) setSelected(res.data.data.attestation);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load attestation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'reg_audit')       return !!r.regulator_audit_in_progress;
      if (filter === 'cross_border')    return !!r.cross_border_feed_break;
      if (filter === 'material_var')    return !!r.material_variance_unresolved;
      if (filter === 'icfr_def')        return !!r.icfr_deficiency_suspected;
      if (filter === 'ext_auditor')     return !!r.external_auditor_request_active;
      if (filter === 'health_red')      return r.attestation_health_band_live === 'red';
      if (filter === 'health_critical') return r.attestation_health_band_live === 'critical';
      if (filter === 'escalated_ac')    return r.chain_status === 'escalated_to_audit_committee';
      if (filter.startsWith('cad:'))    return r.cadence === filter.slice(4);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: RattRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'define-scope') {
        const sources = await prompt(
          'Feed sources (CSV - e.g. SAP_S4HANA,ORACLE_FUSION,SAGE_300,STRATE,SWIFT_MT940,W118_PUBLISHED_BLOCKS):',
          row.feed_sources_csv ?? '',
        );
        if (sources === null) return;
        body.feed_sources_csv = sources;
        const inScope = await prompt('Feeds in scope (count):', String(row.feeds_in_scope ?? 0));
        if (inScope !== null) body.feeds_in_scope = Number(inScope);
        const mat = await prompt('Materiality threshold ZAR:', String(row.materiality_threshold_zar ?? 0));
        if (mat !== null) body.materiality_threshold_zar = Number(mat);
      } else if (action === 'ingest-feeds') {
        const ingested = await prompt('Feeds ingested (count):', String(row.feeds_ingested_count ?? 0));
        if (ingested !== null) body.feeds_ingested_count = Number(ingested);
      } else if (action === 'pair-blocks') {
        const lo = await prompt('W118 block height range low (MANDATORY bridge):', String(row.w118_block_height_range_low ?? ''));
        if (lo === null) return;
        body.w118_block_height_range_low = Number(lo);
        const hi = await prompt('W118 block height range high:', String(row.w118_block_height_range_high ?? lo));
        if (hi === null) return;
        body.w118_block_height_range_high = Number(hi);
        const w119 = await prompt('W119 export pack ref (MANDATORY bridge):', row.w119_export_pack_ref ?? '');
        if (w119) body.w119_export_pack_ref = w119;
        const paired = await prompt('Feeds paired (count):', String(row.feeds_paired_count ?? 0));
        if (paired !== null) body.feeds_paired_count = Number(paired);
      } else if (action === 'compute-variance') {
        const total = await prompt('Total variance ZAR (absolute value):', String(row.total_variance_zar ?? 0));
        if (total !== null) body.total_variance_zar = Number(total);
        const explained = await prompt('Net variance explained ZAR:', String(row.net_variance_explained_zar ?? 0));
        if (explained !== null) body.net_variance_explained_zar = Number(explained);
        const unresolved = await prompt('Unresolved variance ZAR:', String(row.unresolved_variance_zar ?? 0));
        if (unresolved !== null) body.unresolved_variance_zar = Number(unresolved);
      } else if (action === 'classify-break') {
        const klass = await prompt(
          'Break classification (timing/cut_off/fx_translation/manual_journal/intercompany/missing_feed/duplicate_feed/data_quality):',
          row.break_classification ?? '',
        );
        if (klass !== null) body.break_classification = klass;
      } else if (action === 'log-root-cause') {
        const tax = await prompt(
          'Root cause taxonomy (e.g. system_outage_outbound, manual_journal_error, fx_rate_mismatch, late_posting_after_close...):',
          row.root_cause_taxonomy ?? '',
        );
        if (tax !== null) body.root_cause_taxonomy = tax;
      } else if (action === 'propose-remediation') {
        const drafted = await confirmDialog('Action plan drafted?');
        body.action_plan_drafted = drafted ? 1 : 0;
        const owner = await confirmDialog('Owner assigned?');
        body.owner_assigned = owner ? 1 : 0;
        const target = await confirmDialog('Target date set?');
        body.target_date_set = target ? 1 : 0;
        const evidence = await confirmDialog('Evidence attached?');
        body.evidence_attached = evidence ? 1 : 0;
      } else if (action === 'get-counter-party-signoff') {
        const signed = await confirmDialog('Counter-party signed off?');
        body.counter_party_signed_off = signed ? 1 : 0;
      } else if (action === 'run-independent-review') {
        const passed = await confirmDialog('Independent review PASSED?');
        body.independent_review_passed = passed ? 1 : 0;
        const coso = await prompt('COSO components tested (0-5):', String(row.coso_components_tested ?? 5));
        if (coso !== null) body.coso_components_tested = Number(coso);
        const tsc = await prompt('TSC categories tested (0-5):', String(row.tsc_categories_tested ?? 5));
        if (tsc !== null) body.tsc_categories_tested = Number(tsc);
      } else if (action === 'sign-attestation') {
        const cfo = await confirmDialog('CFO attestation signed?');
        body.cfo_attestation_signed = cfo ? 1 : 0;
        const ac = await confirmDialog('Audit committee briefed?');
        body.audit_committee_briefed = ac ? 1 : 0;
      } else if (action === 'archive') {
        const note = await prompt('Archive notes (audit_committee_chair - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject') {
        const reason = await prompt(
          'Reject reason. NOTE: SIGNATURE crosses regulator EVERY tier when material_variance_unresolved AND icfr_deficiency_suspected.',
          row.reject_reason ?? '',
        );
        if (reason === null) return;
        body.reject_reason = reason;
      } else if (action === 'suspend') {
        const reason = await prompt('Suspend reason (regulator-audit-in-progress?):', row.suspend_reason ?? '');
        if (reason === null) return;
        body.suspend_reason = reason;
      } else if (action === 'resume-from-suspend') {
        const note = await prompt('Resume note (back to scope_defined):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'restate') {
        const reason = await prompt(
          'Restate reason (CFO - supersede signed pack; crosses regulator quarterly+annual):',
          row.restate_reason ?? '',
        );
        if (reason === null) return;
        body.restate_reason = reason;
      } else if (action === 'escalate-to-audit-committee') {
        const reason = await prompt(
          'Escalation reason. W120 SIGNATURE: ICFR-DEFICIENCY-ATTEST crosses regulator EVERY tier (JSE 8.62 + s30).',
          row.escalation_reason ?? '',
        );
        if (reason === null) return;
        body.escalation_reason = reason;
      } else if (action === 'lift-escalation') {
        const note = await prompt('Lift escalation note (back to independent_review):', '');
        if (note !== null) body.notes = note;
      }
      await api.post(`/reconciliation-attestation/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/reconciliation-attestation', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  return (
    <div className="text-[12px]" style={{ color: 'oklch(0.17 0.010 250)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2a4d]">Reconciliation attestation (W120)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state ICFR attestation chain reconciling SAP S/4HANA, Oracle Fusion, SAGE 300, Workday, STRATE,
            SWIFT MT940, NERSA/IPPO/DMRE inboxes, bank statements against W118 published blocks.
            INVERTED SLA HOURS (daily 24h / weekly 96h / monthly 168h / quarterly 360h / annual 720h).
            FLOOR-AT-QUARTERLY {'≥'}1 flag / FLOOR-AT-ANNUAL {'≥'}2 flags. Mandatory W118 + W119 bridges.
            SIGNATURE: escalate-to-audit-committee crosses regulator EVERY tier.
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]"
          >
            + Propose attestation
          </button>
        )}
      </div>

      {/* 8-card KPI strip */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Active"         value={kpis.active_count} />
        <Kpi label="Signed"         value={kpis.signed_count} tone="ok" />
        <Kpi label="Archived"       value={kpis.archived_count} tone="ok" />
        <Kpi label="Rejected"       value={kpis.rejected_count} tone={kpis.rejected_count > 0 ? 'bad' : undefined} />
        <Kpi label="Escalated AC"   value={kpis.escalated_count} tone={kpis.escalated_count > 0 ? 'bad' : undefined} />
        <Kpi label="SLA breached"   value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Floor flags"    value={kpis.floor_flag_total} tone={kpis.floor_flag_total > 0 ? 'warn' : undefined} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.proposed_count}</span></span>
        <span>Scope: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.scope_count}</span></span>
        <span>Feeds: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.feeds_count}</span></span>
        <span>Paired: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.paired_count}</span></span>
        <span>Variance: <span className="font-semibold text-[#a06200]">{kpis.variance_count}</span></span>
        <span>Break: <span className="font-semibold text-[#a06200]">{kpis.break_count}</span></span>
        <span>Root cause: <span className="font-semibold text-[#a06200]">{kpis.root_cause_count}</span></span>
        <span>Remediation: <span className="font-semibold text-[#a06200]">{kpis.remediation_count}</span></span>
        <span>Sign-off: <span className="font-semibold text-[#1f6b3a]">{kpis.signoff_count}</span></span>
        <span>Review: <span className="font-semibold text-[#1f6b3a]">{kpis.review_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Restated: <span className="font-semibold text-[#a06200]">{kpis.restated_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Completeness avg: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.completeness_avg}/140</span></span>
        <span>ICFR avg: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.icfr_avg}/140</span></span>
        <span>Variance avg: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.variance_avg}/140</span></span>
        <span>Remediation avg: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.remediation_avg}/140</span></span>
        <span>W118: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.w118_bridged_count}</span></span>
        <span>W119: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.w119_bridged_count}</span></span>
        <span>W113: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.w113_bridged_count}</span></span>
        <span>W114: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.w114_bridged_count}</span></span>
        <span>W115: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.w115_bridged_count}</span></span>
        <span>W116: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.w116_bridged_count}</span></span>
        <span>W117: <span className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{kpis.w117_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
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

      {/* Row 2: lifecycle stages */}
      <div className="mb-2 flex flex-wrap gap-1.5">
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

      {/* Row 3: cadences */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_CADENCE.map((f) => (
          <button type="button"
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Attestation #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Cadence</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Health</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.17 0.010 250)' }}>ICFR</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.17 0.010 250)' }}>Variance</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.17 0.010 250)' }}>Var ZAR</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.17 0.010 250)' }}>Flags</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.17 0.010 250)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.attestation_health_band_live ?? r.attestation_health_band ?? 'green'];
                const icfr = r.icfr_control_effectiveness_index_live ?? r.icfr_control_effectiveness_index ?? 0;
                const varianceIdx = r.variance_score_index_live ?? r.variance_score_index ?? 0;
                const flags = r.floor_flag_count_live ?? 0;
                const varZar = r.total_variance_zar ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.attestation_number}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.period_label}</div>
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                      {r.cfo_attestation_signed ? <span className="ml-1 text-[9px] font-semibold text-[#1f5b3a]">CFO</span> : null}
                      {r.audit_committee_briefed ? <span className="ml-1 text-[9px] font-semibold text-[#1f5b3a]">AC</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: 'oklch(0.17 0.010 250)' }}>{r.cadence.replace(/_/g, ' ')}</td>
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
                    <td className={`px-3 py-2 text-center tabular-nums ${icfr >= 100 ? 'text-[#1f5b3a]' : icfr >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {icfr}/140
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${varianceIdx >= 100 ? 'text-[#1f5b3a]' : varianceIdx >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {varianceIdx}/140
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${varZar > (r.materiality_threshold_zar ?? 0) ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>
                      {fmtZar(varZar)}
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
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No attestations match.</td></tr>
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
  row: RattRow;
  events: RattEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RattRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const completeness = row.reconciliation_completeness_index_live ?? row.reconciliation_completeness_index;
  const icfr = row.icfr_control_effectiveness_index_live ?? row.icfr_control_effectiveness_index;
  const varianceIdx = row.variance_score_index_live ?? row.variance_score_index;
  const remediation = row.remediation_progress_index_live ?? row.remediation_progress_index;

  const ACTIVE_NON_TERMINAL: RattStatus[] = [
    'attestation_proposed', 'scope_defined', 'feeds_ingested', 'blocks_paired',
    'variance_computed', 'break_classified', 'root_cause_logged', 'remediation_proposed',
    'counter_party_signoff', 'independent_review', 'attestation_signed',
  ];
  const SUSPEND_FROM: RattStatus[] = ACTIVE_NON_TERMINAL;
  const REJECTABLE: RattStatus[] = ACTIVE_NON_TERMINAL;
  const ESCALATABLE: RattStatus[] = ACTIVE_NON_TERMINAL;
  const RESTATE_FROM: RattStatus[] = ['attestation_signed', 'archived'];

  const canSuspend  = SUSPEND_FROM.includes(row.chain_status);
  const canRestate  = RESTATE_FROM.includes(row.chain_status);
  const canReject   = REJECTABLE.includes(row.chain_status);
  const canEscalate = ESCALATABLE.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#c2873a] text-white hover:bg-[#c2873a]'
      : tone === 'danger'
        ? 'bg-[#7a0e0e] text-white hover:bg-[#9b1f1f]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-white border border-[#d8dde6] hover:bg-[#f3f5f9]';
    const plainStyle = tone === 'plain' ? { color: 'oklch(0.17 0.010 250)' } : undefined;
    return (
      <button type="button"
        key={action}
        onClick={() => onAct(action, row)}
        className={`rounded px-3 py-1.5 text-[11px] font-semibold ${cls}`}
        style={plainStyle}
        title={ACTION_LABEL[action]}
      >
        {label}
      </button>
    );
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className="w-full max-w-3xl overflow-y-auto bg-[#f3f5f9] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">{row.cadence.replace(/_/g, ' ')} {'•'} {row.current_tier.replace(/_/g, ' ')}</div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.attestation_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'Reconciliation attestation'} {'•'} {row.period_label}
              {row.period_start && row.period_end && (
                <> {'•'} {row.period_start} {'→'} {row.period_end}</>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.17 0.010 250)' }}>Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Completeness" value={`${completeness}/140`} tone={completeness >= 100 ? 'ok' : completeness >= 60 ? 'warn' : 'bad'} />
          <Kpi label="ICFR" value={`${icfr}/140`} tone={icfr >= 100 ? 'ok' : icfr >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Variance" value={`${varianceIdx}/140`} tone={varianceIdx >= 100 ? 'ok' : varianceIdx >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Remediation" value={`${remediation}/140`} tone={remediation >= 100 ? 'ok' : remediation >= 60 ? 'warn' : 'bad'} />
        </div>

        {/* Variance ZAR ledger */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Total variance</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtZar(row.total_variance_zar)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Materiality</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtZar(row.materiality_threshold_zar)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Explained</div>
            <div className="font-mono text-[12px] text-[#1f5b3a]">{fmtZar(row.net_variance_explained_zar)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Unresolved</div>
            <div className={`font-mono text-[12px] ${(row.unresolved_variance_zar ?? 0) > 0 ? 'text-[#9b1f1f] font-semibold' : 'text-[#1f5b3a]'}`}>
              {fmtZar(row.unresolved_variance_zar)}
            </div>
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
              <li>W119 regulator export: <span className={row.bridges_to_w119_regulator_export_chain_live ? 'text-[#1f5b3a] font-semibold' : 'text-[#9b1f1f] font-semibold'}>
                {row.bridges_to_w119_regulator_export_chain_live ? 'BRIDGED (mandatory)' : 'MISSING (mandatory)'}
              </span></li>
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
              <li>Material variance unresolved: <span className={row.material_variance_unresolved ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.material_variance_unresolved ? 'YES' : 'no'}</span></li>
              <li>External auditor request active: <span className={row.external_auditor_request_active ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.external_auditor_request_active ? 'YES' : 'no'}</span></li>
              <li>Regulator audit in progress: <span className={row.regulator_audit_in_progress ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.regulator_audit_in_progress ? 'YES' : 'no'}</span></li>
              <li>Cross-border feed break: <span className={row.cross_border_feed_break ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.cross_border_feed_break ? 'YES' : 'no'}</span></li>
              <li>ICFR deficiency suspected: <span className={row.icfr_deficiency_suspected ? 'text-[#9b1f1f] font-semibold' : 'text-[#6b7685]'}>{row.icfr_deficiency_suspected ? 'YES' : 'no'}</span></li>
            </ul>
            <div className="mt-2 text-[10px] text-[#6b7685]">Feeds: <span className="font-mono" style={{ color: 'oklch(0.17 0.010 250)' }}>{row.feeds_paired_count}/{row.feeds_in_scope}</span> paired {'•'} {row.feeds_paired_pct}%</div>
            {row.feed_sources_csv && <div className="mt-1 text-[10px] text-[#6b7685] break-all">{row.feed_sources_csv}</div>}
          </div>
        </div>

        {/* Timestamps */}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px] text-[#4a5568]">
          <div>Proposed: {fmtDate(row.attestation_proposed_at)}</div>
          <div>Scope defined: {fmtDate(row.scope_defined_at)}</div>
          <div>Feeds ingested: {fmtDate(row.feeds_ingested_at)}</div>
          <div>Blocks paired: {fmtDate(row.blocks_paired_at)}</div>
          <div>Variance computed: {fmtDate(row.variance_computed_at)}</div>
          <div>Break classified: {fmtDate(row.break_classified_at)}</div>
          <div>Root cause logged: {fmtDate(row.root_cause_logged_at)}</div>
          <div>Remediation proposed: {fmtDate(row.remediation_proposed_at)}</div>
          <div>Counter-party sign-off: {fmtDate(row.counter_party_signoff_at)}</div>
          <div>Independent review: {fmtDate(row.independent_review_at)}</div>
          <div>Attestation signed: {fmtDate(row.attestation_signed_at)}</div>
          <div>Archived: {fmtDate(row.archived_at)}</div>
          {row.regulator_crossed_at && <div>Regulator crossed: <span className="font-semibold text-[#9b1f1f]">{fmtDate(row.regulator_crossed_at)}</span></div>}
          {row.regulator_inbox_ref && <div>Regulator inbox: <span className="font-mono text-[10px]">{row.regulator_inbox_ref}</span></div>}
          {row.regulator_ref && <div>Regulator ref: <span className="font-mono text-[10px]">{row.regulator_ref}</span></div>}
          {row.external_auditor_firm && <div>External auditor: <span className="font-mono text-[10px]">{row.external_auditor_firm}</span></div>}
          {row.external_auditor_engagement_ref && <div>Engagement ref: <span className="font-mono text-[10px]">{row.external_auditor_engagement_ref}</span></div>}
        </div>

        {/* Action buttons */}
        <div className="mb-3 flex flex-wrap gap-2">
          {!regulatorView && nextAction && renderAct(nextAction, ACTION_LABEL[nextAction].split(' (')[0], 'primary')}
          {!regulatorView && canSuspend && renderAct('suspend', 'Suspend', 'amber')}
          {!regulatorView && canRestate && renderAct('restate', 'Restate', 'amber')}
          {!regulatorView && canReject && renderAct('reject', 'Reject', 'danger')}
          {!regulatorView && canEscalate && renderAct('escalate-to-audit-committee', 'Escalate to AC (SIGNATURE)', 'danger')}
        </div>

        {/* Event log */}
        <div className="rounded border border-[#d8dde6] bg-white">
          <div className="border-b border-[#e3e7ec] px-3 py-2 text-[11px] font-semibold text-[#0c2a4d]">Event log ({events.length})</div>
          <ul className="divide-y divide-[#e3e7ec] text-[11px]">
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono" style={{ color: 'oklch(0.17 0.010 250)' }}>{e.event_type}</span>
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
  const [cadence, setCadence] = useState<RattCadence>('monthly_management');
  const [periodLabel, setPeriodLabel] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [title, setTitle] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [flagMaterial, setFlagMaterial] = useState(false);
  const [flagExtAuditor, setFlagExtAuditor] = useState(false);
  const [flagRegAudit, setFlagRegAudit] = useState(false);
  const [flagCrossBorder, setFlagCrossBorder] = useState(false);
  const [flagIcfrDef, setFlagIcfrDef] = useState(false);
  const [externalFirm, setExternalFirm] = useState('');
  const [externalRef, setExternalRef] = useState('');

  const submit = () => {
    if (!periodLabel) return;
    onSubmit({
      cadence,
      period_label: periodLabel,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      title: title || null,
      reason_code: reasonCode || null,
      material_variance_unresolved:    flagMaterial ? 1 : 0,
      external_auditor_request_active: flagExtAuditor ? 1 : 0,
      regulator_audit_in_progress:     flagRegAudit ? 1 : 0,
      cross_border_feed_break:         flagCrossBorder ? 1 : 0,
      icfr_deficiency_suspected:       flagIcfrDef ? 1 : 0,
      external_auditor_firm:           externalFirm || null,
      external_auditor_engagement_ref: externalRef || null,
    });
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-base font-semibold text-[#0c2a4d]">Propose reconciliation attestation</h3>
        <div className="space-y-2 text-[12px]">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Cadence (INVERTED SLA: bigger = more time)</div>
            <select value={cadence} onChange={(e) => setCadence(e.target.value as RattCadence)} className="w-full rounded border border-[#d8dde6] px-2 py-1">
              <option value="daily_tactical">Daily tactical (24h)</option>
              <option value="weekly_management">Weekly management (96h)</option>
              <option value="monthly_management">Monthly management (168h)</option>
              <option value="quarterly_attestation">Quarterly attestation (360h)</option>
              <option value="annual_audit">Annual audit (720h)</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Period label (e.g. 2026-Q1, 2026-04, 2026-W21)</div>
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
            <input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="e.g. quarterly_icfr_routine" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">External auditor firm</div>
              <input value={externalFirm} onChange={(e) => setExternalFirm(e.target.value)} placeholder="e.g. PwC South Africa" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
            <label>
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Engagement ref</div>
              <input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="e.g. ENG-2026-OE-Q1" className="w-full rounded border border-[#d8dde6] px-2 py-1" />
            </label>
          </div>
          <div className="rounded border border-[#d8dde6] bg-[#f8fafc] p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#6b7685]">
              Floor flags ({'≥'}1 lifts to quarterly; {'≥'}2 lifts to annual)
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagMaterial} onChange={(e) => setFlagMaterial(e.target.checked)} /> Material variance unresolved</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagExtAuditor} onChange={(e) => setFlagExtAuditor(e.target.checked)} /> External auditor request active</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagRegAudit} onChange={(e) => setFlagRegAudit(e.target.checked)} /> Regulator audit in progress</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagCrossBorder} onChange={(e) => setFlagCrossBorder(e.target.checked)} /> Cross-border feed break</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={flagIcfrDef} onChange={(e) => setFlagIcfrDef(e.target.checked)} /> ICFR deficiency suspected</label>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.17 0.010 250)' }}>Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]">Propose</button>
        </div>
      </div>
    </div>
  );
}
